"""
Models for Event Stock Management System
"""
from datetime import datetime
from typing import Optional


class StockItem:
    """Represents a stock item in the inventory"""
    
    def __init__(self, item_id: str, name: str, quantity: int, 
                 category: str, unit: str = "pieces"):
        self.item_id = item_id
        self.name = name
        self.quantity = quantity
        self.category = category
        self.unit = unit
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
    
    def update_quantity(self, amount: int):
        """Update the quantity of the item"""
        self.quantity += amount
        self.updated_at = datetime.now()
    
    def to_dict(self):
        """Convert the item to a dictionary"""
        return {
            'item_id': self.item_id,
            'name': self.name,
            'quantity': self.quantity,
            'category': self.category,
            'unit': self.unit,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __str__(self):
        return f"{self.name} ({self.item_id}): {self.quantity} {self.unit} - {self.category}"


class Event:
    """Represents an event"""
    
    def __init__(self, event_id: str, name: str, date: str, location: str):
        self.event_id = event_id
        self.name = name
        self.date = date
        self.location = location
        self.stock_allocations = {}  # item_id -> quantity allocated
        self.created_at = datetime.now()
    
    def allocate_stock(self, item_id: str, quantity: int):
        """Allocate stock to this event"""
        if item_id in self.stock_allocations:
            self.stock_allocations[item_id] += quantity
        else:
            self.stock_allocations[item_id] = quantity
    
    def deallocate_stock(self, item_id: str, quantity: int):
        """Deallocate stock from this event"""
        if item_id in self.stock_allocations:
            self.stock_allocations[item_id] -= quantity
            if self.stock_allocations[item_id] <= 0:
                del self.stock_allocations[item_id]
    
    def to_dict(self):
        """Convert the event to a dictionary"""
        return {
            'event_id': self.event_id,
            'name': self.name,
            'date': self.date,
            'location': self.location,
            'stock_allocations': self.stock_allocations,
            'created_at': self.created_at.isoformat()
        }
    
    def __str__(self):
        return f"{self.name} ({self.event_id}) - {self.date} at {self.location}"
