-- Add Artificial Analysis benchmark index columns to performance_metrics
ALTER TABLE performance_metrics ADD COLUMN intelligence_index REAL;
ALTER TABLE performance_metrics ADD COLUMN coding_index REAL;
