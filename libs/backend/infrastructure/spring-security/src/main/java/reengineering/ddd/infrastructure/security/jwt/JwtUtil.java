package reengineering.ddd.infrastructure.security.jwt;

import com.businessdrivenai.domain.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.SecurityException;
import jakarta.inject.Inject;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Optional;
import javax.crypto.SecretKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtUtil {
  private static final Logger logger = LoggerFactory.getLogger(JwtUtil.class);

  private final SecretKey secretKey;
  private final long expirationMs;

  @Inject
  public JwtUtil(
      @Value("${jwt.secret:default-secret-key-for-development-only-change-in-production}")
          String secret,
      @Value("${jwt.expiration-ms:86400000}") long expirationMs) {
    // Ensure the secret is at least 256 bits (32 bytes) for HS256
    String paddedSecret =
        secret.length() >= 32 ? secret : String.format("%-32s", secret).replace(' ', '0');
    this.secretKey = Keys.hmacShaKeyFor(paddedSecret.getBytes(StandardCharsets.UTF_8));
    this.expirationMs = expirationMs;
  }

  public String generateToken(User user) {
    Date now = new Date();
    Date expiryDate = new Date(now.getTime() + expirationMs);

    return Jwts.builder()
        .subject(user.getIdentity())
        .claim("name", user.getDescription().name())
        .claim("email", user.getDescription().email())
        .issuedAt(now)
        .expiration(expiryDate)
        .signWith(secretKey)
        .compact();
  }

  public Optional<String> getUserIdFromToken(String token) {
    try {
      Claims claims =
          Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
      return Optional.ofNullable(claims.getSubject());
    } catch (ExpiredJwtException e) {
      logger.warn("JWT token is expired: {}", e.getMessage());
    } catch (MalformedJwtException e) {
      logger.warn("Invalid JWT token: {}", e.getMessage());
    } catch (SecurityException e) {
      logger.warn("JWT signature validation failed: {}", e.getMessage());
    } catch (IllegalArgumentException e) {
      logger.warn("JWT claims string is empty: {}", e.getMessage());
    }
    return Optional.empty();
  }

  public boolean validateToken(String token) {
    return getUserIdFromToken(token).isPresent();
  }
}
