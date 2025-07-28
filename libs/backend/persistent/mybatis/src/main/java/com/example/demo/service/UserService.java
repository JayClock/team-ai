package com.example.demo.service;

import teamai.ddd.model.User;
import teamai.ddd.model.Users;
import teamai.ddd.description.UserDescription;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class UserService implements Users {

    public User createUser(String identity, String name, String email) {
        // This demonstrates that we can use classes from the domain module
        UserDescription description = new UserDescription(name, email);
        return new User(identity, description);
    }

    @Override
    public Optional<User> findById(String id) {
        // This demonstrates that we can implement interfaces from the domain module
        // In a real implementation, this would query the database
        return Optional.empty();
    }
}
