const { parser } = require("@lezer/markdown");

const tree = parser.parse("# Hello World");
let cursor = tree.cursor();
do {
  console.log(cursor.name, cursor.from, cursor.to, "'" + "# Hello World".slice(cursor.from, cursor.to) + "'");
} while (cursor.next());
