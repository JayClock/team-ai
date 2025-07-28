package teamai.ddd.model;

import teamai.ddd.archtype.Entity;
import teamai.ddd.description.UserDescription;

public class User implements Entity<String, UserDescription> {
    private String identity;
    private UserDescription description;

    public User(String identity, UserDescription description) {
        this.identity = identity;
        this.description = description;
    }

    private User() {
    }

    @Override
    public String getIdentity() {
        return identity;
    }

    @Override
    public UserDescription getDescription() {
        return description;
    }
}
