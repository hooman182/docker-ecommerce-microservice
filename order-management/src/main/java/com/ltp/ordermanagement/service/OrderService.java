package com.ltp.ordermanagement.service;

import com.ltp.ordermanagement.CartItem;
import com.ltp.ordermanagement.CartItemEntity;
import com.ltp.ordermanagement.model.InventoryResponse;
import com.ltp.ordermanagement.model.Product;
import com.ltp.ordermanagement.repository.CartItemRepository;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class OrderService {

    private final RestTemplate restTemplate;
    private final CartItemRepository cartItemRepository;

    @Value("${PRODUCT_INVENTORY_API_HOST}")
    private String productInventoryApiHost;

    @Value("${PRODUCT_CATALOG_API_HOST}")
    private String productCatalogApiHost;

    @Value("${SHIPPING_HANDLING_API_HOST}")
    private String shippingHandlingApiHost;

    @Autowired
    public OrderService(RestTemplate restTemplate, CartItemRepository cartItemRepository) {
        this.restTemplate = restTemplate;
        this.cartItemRepository = cartItemRepository;
    }

    public String addToCart(Long userId, Product product) {
        // Check if the product already exists in the user's cart
        List<CartItem> cart = getUserCart(userId);
        if (cart.stream().anyMatch(item -> item.getProductId().equals(product.getId()))) {
            return "Product already exists in the cart";
        }

        // Check the inventory of the product
        System.out.println(productInventoryApiHost + ":3002/api/inventory/" + product.getId());
        InventoryResponse inventoryResponse = restTemplate.getForObject(productInventoryApiHost + ":3002/api/inventory/" + product.getId(), InventoryResponse.class);
        if (inventoryResponse == null || inventoryResponse.getQuantity() <= 0) {
            return "Product is out of stock";
        }
        System.out.println(productCatalogApiHost + ":3001/api/products/" + product.getId());
        Product productDetails = restTemplate.getForObject(productCatalogApiHost + ":3001/api/products/" + product.getId(), Product.class);

        // Add the product to the user's cart (persisted in MySQL)
        CartItemEntity entity = new CartItemEntity(
            userId,
            productDetails.getId(),
            1, // assuming quantity 1 for simplicity
            productDetails.getName(),
            productDetails.getDescription(),
            productDetails.getPrice(),
            productDetails.getCategory()
        );
        try {
            cartItemRepository.save(entity);
        } catch (DataIntegrityViolationException dive) {
            // Lost a race against a concurrent addToCart; treat as already in cart
            return "Product already exists in the cart";
        }
        printCartItems(userId);

        return "Product added to the cart";
    }

    public double getCartSubtotal(Long userId) {
        List<CartItem> cart = getUserCart(userId);
        return cart.stream()
                .mapToDouble(item -> {
                    Product product = restTemplate.getForObject(productCatalogApiHost + ":3001/api/products/" + item.getProductId(), Product.class);
                    return product.getPrice() * item.getQuantity();
                })
                .sum();
    }

    public double getCartShippingTotal(Long userId) {
        List<CartItem> cart = getUserCart(userId);
        double sum = cart.stream()
                .mapToDouble(item -> {
                    // Assuming the endpoint URL is correct and returns data as expected
                    Product product = restTemplate.getForObject(shippingHandlingApiHost + ":8080/shipping-fee?product_id=" + item.getProductId(), Product.class);
                    if (product != null) {
                        return product.getShippingFee();
                    } else {
                        // Handle the case where the shipping fee might not be available
                        return 0;
                    }
                })
                .sum();
        return sum;
    }

    public double getCartTotal(Long userId) {
        double subtotal = getCartSubtotal(userId);
        double shippingTotal = getCartShippingTotal(userId);
        return subtotal + shippingTotal;
    }

    private void printCartItems(Long userId) {
        List<CartItem> cart = getUserCart(userId);
        System.out.println("Items in user " + userId + "'s cart:");
        for (CartItem item : cart) {
            Product product = restTemplate.getForObject(
                productCatalogApiHost + ":3001/api/products/" + item.getProductId(),
                Product.class
            );
            System.out.println("Product ID: " + item.getProductId() +
                               ", Quantity: " + item.getQuantity() +
                               ", Name: " + product.getName() +
                               ", Price: " + product.getPrice());
        }
    }

    public String purchaseCart(Long userId) {
        List<CartItem> cart = getUserCart(userId);

        // Update the inventory for each product in the cart
        for (CartItem item : cart) {
            restTemplate.postForObject(productInventoryApiHost + ":3002/api/order/" + item.getProductId(), item.getQuantity(), Void.class);
        }

        // Clear the user's cart after purchase (rows removed from MySQL)
        cartItemRepository.deleteByUserId(userId);

        return "Purchase completed";
    }

    // Load the user's cart from MySQL and map entities to the API DTO
    public List<CartItem> getUserCart(Long userId) {
        return cartItemRepository.findByUserIdOrderByIdAsc(userId).stream()
                .map(e -> new CartItem(
                        e.getProductId(),
                        e.getQuantity(),
                        e.getName(),
                        e.getDescription(),
                        e.getPrice(),
                        e.getCategory()))
                .collect(Collectors.toList());
    }
}
