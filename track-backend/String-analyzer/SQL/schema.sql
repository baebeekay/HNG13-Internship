CREATE TABLE strings (
  id VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  length INTEGER NOT NULL,
  is_palindrome BOOLEAN NOT NULL,
  unique_characters INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  character_frequency_map JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sha256_hash ON strings (sha256_hash);
CREATE INDEX idx_value ON strings (value);
CREATE INDEX idx_is_palindrome ON strings (is_palindrome);
CREATE INDEX idx_length ON strings (length);
CREATE INDEX idx_word_count ON strings (word_count);
