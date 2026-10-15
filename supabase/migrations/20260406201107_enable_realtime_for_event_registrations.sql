/*
  # Enable realtime for event_registrations table

  1. Changes
    - Enable realtime replication for the event_registrations table
    - This allows the frontend to subscribe to changes in volunteer registrations
    - Parents will see the Bénévoles menu item appear dynamically when they register as volunteers
*/

ALTER PUBLICATION supabase_realtime ADD TABLE event_registrations;