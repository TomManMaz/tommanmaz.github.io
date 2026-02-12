from __future__ import annotations
from data.employee import Employee


class BusLeg:
    """The bus leg class.
    """

    def __init__(self, id: int, tour: int, start: float, end: float, start_pos: int, end_pos: int) -> None:
        self.id = id
        self.tour = tour
        self.start = start
        self.end = end
        self.start_pos = start_pos
        self.end_pos = end_pos
        self.name = id
        self.employee = None
        self.original_index = id
        
    def __str__(self) -> str:
        return str(self.id)

    def __repr__(self) -> str:
        return str(self.id)

    def __hash__(self):
        return hash(self.id)

    def __getitem__(self, item):
        return item
    
    @property
    def drive(self) -> int:
        return self.end - self.start

    def register_employee(self, employee: Employee) -> None:
        self.employee = employee 

    def __eq__(self, other):
        if isinstance(other, BusLeg):
            return self.id == other.id

    def __le__(self, other):
        if isinstance(other, BusLeg):
            return self.id == other.id
        return (self.start < other.start) or (self.start == other.start and self.id < other.id)

    def __lt__(self, other):
        if (self.id is None) or (other is None):
            return self.start < other.start
        return (self.start < other.start or (self.start == other.start and self.id < other.id))

    def __gt__(self, other):
        if (self.id is None) or (other is None):
            return self.start > other.start
        return (self.start > other.start or (self.start == other.start and self.id > other.id))
