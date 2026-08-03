import { SearchQuery } from '@codemirror/search'; try { new SearchQuery({search: '[', regexp: true}); console.log('ok'); } catch(e) { console.log('error:', e.message); }
