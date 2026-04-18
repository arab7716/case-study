import React from 'react';
import './ProductCard.css';

function ProductCard({ partNumber, price, name, productUrl }) {
  // Use the exact working URL provided by the AI's live web search!
  
  return (
    <div className="product-card">
      <div className="product-card-header">
        <span className="product-part-number">Part #{partNumber}</span>
        <span className="product-price">{price}</span>
      </div>
      <div className="product-card-body">
        <h4 className="product-name">{name}</h4>
        {/* We add a fallback URL just in case the AI misses it */}
        <a href={productUrl || `https://www.partselect.com`} target="_blank" rel="noopener noreferrer" className="product-button">
          View & Add to Cart
        </a>
      </div>
    </div>
  );
}

export default ProductCard;