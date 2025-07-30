CREATE TABLE `accounts`
(
  `id`          BIGINT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `provider`    VARCHAR(50)  NOT NULL,
  `provider_id` VARCHAR(255) NOT NULL,
  `user_id`     VARCHAR(255),
  UNIQUE (`provider`, `provider_id`),
  FOREIGN KEY (`user_id`) REFERENCES USERS (ID)
);
