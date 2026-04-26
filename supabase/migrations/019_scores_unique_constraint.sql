-- Prevent duplicate scores: each project can only have one score per model
ALTER TABLE scores
  ADD CONSTRAINT scores_project_model_unique UNIQUE (project_id, model);
