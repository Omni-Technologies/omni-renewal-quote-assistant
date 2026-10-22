-- One shared copy of what each browser used to keep in IndexedDB.
-- Records are stored as the app's own JSON so the app's model code stays the
-- single place that understands their shape.

CREATE TABLE renewals (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE decisions (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Active history import per kind ('dtools' timesheets, 'jobcost' job cost).
CREATE TABLE datasets (
  kind TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- That import's rows/projects, split into JSON arrays that fit D1's row size.
CREATE TABLE dataset_chunks (
  kind TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (kind, seq)
);
