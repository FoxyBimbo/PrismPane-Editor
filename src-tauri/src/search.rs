use ignore::WalkBuilder;
use serde::Serialize;
use std::fs;
use std::sync::Mutex;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexReader, TantivyDocument};
use regex::Regex;

pub struct SearchState {
    pub index: Mutex<Option<Index>>,
    pub reader: Mutex<Option<IndexReader>>,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub result_type: String, // "folder", "file", "content"
    pub file_path: String,
    pub name: String,
    pub line: Option<usize>,
    pub content: Option<String>,
}

#[tauri::command]
pub async fn build_search_index(
    path: String,
    state: tauri::State<'_, SearchState>,
) -> Result<(), String> {
    let mut schema_builder = Schema::builder();
    let path_field = schema_builder.add_text_field("path", STRING | STORED);
    let name_field = schema_builder.add_text_field("name", TEXT | STORED);
    let content_field = schema_builder.add_text_field("content", TEXT);
    let is_dir_field = schema_builder.add_u64_field("is_dir", FAST | STORED);
    let schema = schema_builder.build();

    let index = Index::create_in_ram(schema.clone());
    let mut index_writer = index.writer(50_000_000).map_err(|e| e.to_string())?;

    let walk = WalkBuilder::new(&path)
        .hidden(true)
        .git_ignore(true)
        .ignore(true)
        .build();

    for result in walk {
        if let Ok(entry) = result {
            let file_path = entry.path().to_string_lossy().to_string();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_dir = if entry.path().is_dir() { 1u64 } else { 0u64 };

            let mut content = String::new();
            if !entry.path().is_dir() {
                // Read text files for indexing
                let is_markdown_or_txt = file_name.to_lowercase().ends_with(".md")
                    || file_name.to_lowercase().ends_with(".markdown")
                    || file_name.to_lowercase().ends_with(".txt")
                    || file_name.to_lowercase().ends_with(".tsx") // index code files too for UI
                    || file_name.to_lowercase().ends_with(".ts")
                    || file_name.to_lowercase().ends_with(".js")
                    || file_name.to_lowercase().ends_with(".jsx")
                    || file_name.to_lowercase().ends_with(".json")
                    || file_name.to_lowercase().ends_with(".css")
                    || file_name.to_lowercase().ends_with(".html")
                    || file_name.to_lowercase().ends_with(".rs")
                    || file_name.to_lowercase().ends_with(".toml");

                if is_markdown_or_txt {
                    content = fs::read_to_string(entry.path()).unwrap_or_default();
                }
            }

            index_writer
                .add_document(doc!(
                    path_field => file_path,
                    name_field => file_name,
                    content_field => content,
                    is_dir_field => is_dir
                ))
                .map_err(|e| e.to_string())?;
        }
    }

    index_writer.commit().map_err(|e| e.to_string())?;

    let reader = index
        .reader()
        .map_err(|e| e.to_string())?;

    *state.index.lock().unwrap() = Some(index);
    *state.reader.lock().unwrap() = Some(reader);

    Ok(())
}

#[tauri::command]
pub async fn search_index(
    query: String,
    search_inside: bool,
    use_regex: bool,
    match_case: bool,
    state: tauri::State<'_, SearchState>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let reader_guard = state.reader.lock().unwrap();
    let reader = match &*reader_guard {
        Some(r) => r,
        None => return Err("Index not built".to_string()),
    };

    let index_guard = state.index.lock().unwrap();
    let index = match &*index_guard {
        Some(i) => i,
        None => return Err("Index not built".to_string()),
    };

    let searcher = reader.searcher();
    let schema = index.schema();
    let path_field = schema.get_field("path").unwrap();
    let name_field = schema.get_field("name").unwrap();
    let content_field = schema.get_field("content").unwrap();
    let is_dir_field = schema.get_field("is_dir").unwrap();

    // 1. Compile regex for exact matching
    let regex_pattern = if use_regex {
        query.clone()
    } else {
        regex::escape(&query)
    };

    let regex_pattern_with_case = if match_case {
        regex_pattern
    } else {
        format!("(?i){}", regex_pattern)
    };

    let matcher = match Regex::new(&regex_pattern_with_case) {
        Ok(re) => re,
        Err(_) => return Ok(vec![]), // Invalid regex
    };

    // 2. Query Tantivy to get candidate files
    // Extract alphanumeric words from query to use in Tantivy
    let words: Vec<&str> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();

    let candidate_docs: Vec<_> = if words.is_empty() {
        // If no alphanumeric words, we must match all documents and scan
        let query_obj = tantivy::query::AllQuery;
        let top_docs = searcher
            .search(&query_obj, &TopDocs::with_limit(10_000))
            .map_err(|e| e.to_string())?;
        top_docs.into_iter().map(|(_, doc_addr)| doc_addr).collect()
    } else {
        // Build a Boolean query requiring ALL words
        let parser = QueryParser::for_index(&index, vec![name_field, content_field]);
        let term_query_str = words.join(" AND ");
        let query_obj = parser
            .parse_query(&term_query_str)
            .map_err(|e| e.to_string())?;

        let top_docs = searcher
            .search(&query_obj, &TopDocs::with_limit(10_000))
            .map_err(|e| e.to_string())?;
        top_docs.into_iter().map(|(_, doc_addr)| doc_addr).collect()
    };

    // 3. Scan candidate files for exact matches
    let mut final_results = Vec::new();
    let mut result_count = 0;
    const MAX_RESULTS: usize = 200;

    for doc_address in candidate_docs {
        if result_count >= MAX_RESULTS {
            break;
        }

        let retrieved_doc: TantivyDocument = searcher.doc(doc_address).map_err(|e| e.to_string())?;
        let file_path = retrieved_doc
            .get_first(path_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let file_name = retrieved_doc
            .get_first(name_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let is_dir = retrieved_doc
            .get_first(is_dir_field)
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            == 1;

        // Check if name matches
        if matcher.is_match(&file_name) {
            final_results.push(SearchResult {
                result_type: if is_dir { "folder".to_string() } else { "file".to_string() },
                file_path: file_path.clone(),
                name: file_name.clone(),
                line: None,
                content: None,
            });
            result_count += 1;
        }

        // Check file content if requested and not a dir
        if search_inside && !is_dir {
            if let Ok(content) = fs::read_to_string(&file_path) {
                for (i, line) in content.lines().enumerate() {
                    if result_count >= MAX_RESULTS {
                        break;
                    }
                    if matcher.is_match(line) {
                        final_results.push(SearchResult {
                            result_type: "content".to_string(),
                            file_path: file_path.clone(),
                            name: file_name.clone(),
                            line: Some(i + 1),
                            content: Some(line.trim().to_string()),
                        });
                        result_count += 1;
                    }
                }
            }
        }
    }

    Ok(final_results)
}
