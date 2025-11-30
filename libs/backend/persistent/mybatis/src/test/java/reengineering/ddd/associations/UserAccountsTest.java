package reengineering.ddd.associations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;

import jakarta.inject.Inject;
import reengineering.ddd.BaseTestContainersTest;
import reengineering.ddd.teamai.description.AccountDescription;
import reengineering.ddd.teamai.description.UserDescription;
import reengineering.ddd.teamai.model.User;
import reengineering.ddd.teamai.model.Users;

@MybatisTest
public class UserAccountsTest extends BaseTestContainersTest {
    @Inject
    private Users users;

    private User user;

    @BeforeEach
    public void setUp() {
        user = users.createUser(new UserDescription("john.smith", "john.smith@email.com"));
        user.add(new AccountDescription("github", "github01"));
    }

    @Test
    public void should_get_accounts_association_of_user() {
        assertEquals(1, user.accounts().findAll().size());
    }

    @Test
    public void should_find_account_by_user_and_id() {
        String identity = user.accounts().findAll().iterator().next().getIdentity();
        assertEquals(identity, user.accounts().findByIdentity(identity).get().getIdentity());
    }

    @Test
    public void should_not_find_account_by_user_and_id_if_not_exist() {
        assertTrue(user.accounts().findByIdentity("-1").isEmpty());
    }
}
