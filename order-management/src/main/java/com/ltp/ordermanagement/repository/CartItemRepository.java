package com.ltp.ordermanagement.repository;

import com.ltp.ordermanagement.CartItemEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data JPA repository backing the cart persistence layer.
 */
public interface CartItemRepository extends JpaRepository<CartItemEntity, Long> {

    List<CartItemEntity> findByUserIdOrderByIdAsc(Long userId);

    Optional<CartItemEntity> findByUserIdAndProductId(Long userId, Long productId);

    void deleteByUserId(Long userId);
}
