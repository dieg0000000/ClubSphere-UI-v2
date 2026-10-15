/*
  # Add included_persons to event_tariffs

  1. Modified Tables
    - `event_tariffs` - Added column:
      - `included_persons` (integer, DEFAULT 1) - Number of persons included in the tariff
        Examples: "Individuel" = 1, "Table de 6" = 6, "Table de 12" = 12
*/

ALTER TABLE event_tariffs ADD COLUMN IF NOT EXISTS included_persons integer DEFAULT 1;
