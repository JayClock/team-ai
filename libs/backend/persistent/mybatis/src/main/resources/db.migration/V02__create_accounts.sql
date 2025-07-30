CREATE TABLE accounts
(
  id          BIGSERIAL PRIMARY KEY,
  provider    VARCHAR(50)  NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  user_id     BIGINT,
  UNIQUE (provider, provider_id),
  FOREIGN KEY (user_id) REFERENCES users (id)
);
