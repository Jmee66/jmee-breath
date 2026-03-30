-- Fix: reference_max_s peut contenir des décimaux (ex: 164.537)
ALTER TABLE apnea_tables ALTER COLUMN reference_max_s TYPE real;
