# Spring Security Infrastructure

This module provides Spring Security configuration for authentication and authorization.

## Components

- **SecurityConfig**: Main Spring Security configuration with OAuth2 login support
- **OAuth2UserService**: Custom OAuth2 user service that handles user creation and account linking

## Features

- OAuth2 authentication (GitHub integration)
- Custom authentication success/failure handlers
- JSON-based authentication responses
- Profile-based security configuration (dev/production)

## Dependencies

- `backend:domain` - Domain models (User, Users, AccountDescription, UserDescription)
- Spring Security
- Spring OAuth2 Client
- Spring HATEOAS
