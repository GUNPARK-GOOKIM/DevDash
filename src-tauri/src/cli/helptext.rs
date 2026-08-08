//! Shared help strings so every command documents flags the same way.
pub const H_CONN: &str = "Saved connection name or id prefix (overrides catalog default)";
pub const H_PASS: &str = "Password (--password > DEVDASH_PASSWORD > OS keyring > prompt)";
pub const H_FMT_TABLE: &str = "Output format: table | json | csv | tsv";
pub const H_FMT_EXPORT: &str = "Export format: csv | json | sql | parquet";
pub const H_OUT: &str = "Write output to a file instead of stdout";
pub const H_YES: &str = "Allow destructive SQL (Safe Mode confirmation)";
pub const H_RO: &str = "Force read-only for this invocation";

pub const AFTER_ROOT: &str = "\
Quick start:
  1.  devdash doctor
  2.  devdash connect add --name local --url 'postgres://user@localhost:5432/app'
  3.  devdash connect test
  4.  devdash sql 'select 1'
  5.  devdash repl

Docs: docs/CLI.md   ·   Exit codes: 0 ok · 1 error · 2 usage · 3 connect · 4 safe/ro · 5 not found";

pub const AFTER_SQL: &str = "\
Examples:
  devdash sql 'select now()'
  devdash sql -f report.sql -F json -o out.json
  echo 'select 1' | devdash sql -F csv
  devdash sql 'drop table scratch' --yes";

pub const AFTER_CONNECT: &str = "\
Examples:
  devdash connect add --name local --url 'postgres://user@localhost:5432/app'
  devdash connect add --name analytics --type duckdb --database ./wh.duckdb
  devdash connect ls
  devdash connect use local
  devdash connect test";

pub const AFTER_REPL: &str = "\
Meta commands:  \\tables  \\d <table>  \\c <name>  \\begin  \\commit  \\rollback  \\?  \\q
Examples:
  devdash repl
  devdash repl -c staging --yes";

pub const AFTER_SCHEMA: &str = "\
Examples:
  devdash schema ddl public.orders
  devdash schema indexes users
  devdash schema diff --from staging --to prod --table users -o users.sql
  devdash schema apply -f users.sql --dry-run
  devdash schema runs";

pub const AFTER_SNAPSHOT: &str = "\
Examples:
  devdash snapshot save --name before 'select * from users'
  devdash snapshot ls
  devdash snapshot diff <left-id> <right-id>
  devdash snapshot rm <id>";

pub const AFTER_IMPORT: &str = "\
Examples:
  devdash import csv users --file users.csv --preview
  devdash import csv users --file users.csv
  devdash import sql --file dump.sql --yes";

pub const AFTER_STRUCTURE: &str = "\
Examples:
  devdash structure add-column --table users --name nickname --type TEXT --nullable
  devdash structure drop-column --table users --name nickname
  devdash structure add-index --table users --name idx_email --columns email --unique";
