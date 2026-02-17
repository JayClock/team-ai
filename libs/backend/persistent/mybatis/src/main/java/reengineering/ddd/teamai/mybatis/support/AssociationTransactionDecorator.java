package reengineering.ddd.teamai.mybatis.support;

import java.util.function.Supplier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class AssociationTransactionDecorator {

  private final ObjectProvider<PlatformTransactionManager> transactionManagerProvider;

  public AssociationTransactionDecorator(
      ObjectProvider<PlatformTransactionManager> transactionManagerProvider) {
    this.transactionManagerProvider = transactionManagerProvider;
  }

  public <T> T execute(Supplier<T> action) {
    PlatformTransactionManager transactionManager = transactionManagerProvider.getIfAvailable();
    if (transactionManager == null) {
      return action.get();
    }
    return new TransactionTemplate(transactionManager).execute(status -> action.get());
  }
}
