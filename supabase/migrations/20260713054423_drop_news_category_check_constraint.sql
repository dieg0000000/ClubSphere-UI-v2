/*
# Drop news_category_check constraint

## Problem
The news table has a CHECK constraint restricting category to four hardcoded values.
Now that categories are managed dynamically via the news_categories table, the
constraint must be removed so admins can add custom category names.

## Modified Tables
- `news`: Dropped CHECK constraint `news_category_check`.
*/

ALTER TABLE news DROP CONSTRAINT IF EXISTS news_category_check;
