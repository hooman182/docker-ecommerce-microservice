import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# CORS: allowlist via env (comma-separated origins); "*" keeps demo behavior
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]
CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})


# Health check for K8s probes / ELB (guide 5.1, 5.2)
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'UP', 'service': 'product-inventory'})

# ------------------------------------------------------------
# Database configuration (env-driven: RDS in prod, compose in dev)
# ------------------------------------------------------------
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '3306')
DB_USER = os.environ.get('DB_USER', 'ecommerce_user')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'ecommerce_pass')
DB_NAME = os.environ.get('DB_NAME', 'ecommerce')

app.config['SQLALCHEMY_DATABASE_URI'] = (
    f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': int(os.environ.get('DB_POOL_SIZE', '10')),
    'pool_recycle': 3600,
    'pool_pre_ping': True,
}

db = SQLAlchemy(app)


class Inventory(db.Model):
    __tablename__ = 'inventory'

    product_id = db.Column(db.BigInteger, primary_key=True)
    quantity = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {'id': self.product_id, 'quantity': self.quantity}


# Get inventory for all products
@app.route('/api/inventory', methods=['GET'])
def get_inventory():
    rows = Inventory.query.order_by(Inventory.product_id).all()
    return jsonify([row.to_dict() for row in rows])


# Get inventory for a single product by ID
@app.route('/api/inventory/<int:product_id>', methods=['GET'])
def get_product_inventory(product_id):
    row = db.session.get(Inventory, product_id)
    if row:
        return jsonify(row.to_dict())
    return jsonify({'error': 'Product not found'}), 404


# Reduce the quantity of a product by 1
@app.route('/api/order/<int:product_id>', methods=['POST'])
def order_product(product_id):
    row = db.session.get(Inventory, product_id)
    if row is None:
        return jsonify({'error': 'Product not found'}), 404
    if row.quantity <= 0:
        return jsonify({'error': 'Product is out of stock'}), 400

    row.quantity -= 1
    db.session.commit()
    return jsonify(row.to_dict())


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3002)