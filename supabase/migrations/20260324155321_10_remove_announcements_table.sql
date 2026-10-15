/*
  # Remove announcements table

  1. Changes
    - Drop announcements table and all related policies
    - Remove announcements functionality to consolidate with news system
  
  2. Security
    - All RLS policies for announcements are dropped with the table
*/

DROP TABLE IF EXISTS announcements CASCADE;
