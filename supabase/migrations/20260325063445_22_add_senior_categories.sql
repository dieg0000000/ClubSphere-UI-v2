/*
  # Add Senior Categories to Team Categories

  1. Changes
    - Add three new senior age categories for active teams
    - Seniors +30, +40, and +50
    
  2. New Categories
    - Seniors +30 (display_order: 8)
    - Seniors +40 (display_order: 9)
    - Seniors +50 (display_order: 10)
*/

-- Add senior categories
INSERT INTO team_categories (type, name, display_order, active) VALUES
('active', 'Seniors +30', 8, true),
('active', 'Seniors +40', 9, true),
('active', 'Seniors +50', 10, true);