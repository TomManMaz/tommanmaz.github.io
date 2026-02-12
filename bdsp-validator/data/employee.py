from __future__ import annotations
from typing import List
from sortedcontainers import SortedList

# from data.busleg import BusLeg

EMPLOYEE_D_MAX = 9*60
EMPLOYEE_W_MAX = 10*60
EMPLOYEE_W_MIN = 6.5*60
EMPLOYEE_T_MAX = 14*60


class Employee:
    """ Class that represents the Employee (or Shift).
    """

    ID = 1

    def __init__(self, id: int, instance) -> None:
        self.id = id
        Employee.ID += 1
        self.legs = SortedList()
        self.state = State(self)
        self.instance = instance
        self.objective = 0
        self.name = 'E' + str(self.id)
   
    def revert(self) -> None:
        self.objective = self.previous_objective
        self.state = self.previous_state

    def add_bus(self, leg) -> None:
        self.legs.add(leg)
        leg.register_employee(self)

    def evaluate(self):
        """ Evaluate the objective function of the current employee  """
        self.previous_state = self.state
        self.previous_objective = self.objective
        self.state = State(self)
        self.objective = self.state.evaluate()
        return self.objective

    def _eq_(self, other):
        if isinstance(other, Employee):
            # return self.id == other.id
            return self.legs == other.legs
        return False

    def __iter__(self):
        return iter(self.legs)
    
    def copy(self) -> Employee:
        output = Employee(self.id, self.instance)
        output.legs = self.legs.copy()
        output.objective = self.objective
        output.state = self.state
        return output



    def add_leg(self, leg) -> None:
        """
        Add a bus leg to the employee
        
        Parameters
        ----------
        
        leg : BusLeg
            leg to be added to the employee
        """

        self.legs.add(leg)
        leg.register_employee(self)


class State:
    def __init__(self, employee: Employee):
        self.feasible = True
        self.employee = employee
        self.MultiValue = {}
        self.work_time = 0
        self.start_shift = 10**(20)
        self.end_shift = 0
        self.start = 0
        self.end = 0
        self.bus_penalty = 0
        self.drive_penalty = 0
        self.drive_time = 0
        self.rest_penalty = 0
        self.rest = 0
        self.first15 = False
        self.break30 = False
        self.center30 = False
        self.unpaid = 0
        self.ride = 0
        self.change = 0
        self.split = 0
        self.split_time = 0
        self.objective = 0
        self.total_time = 0
        self.upmax = 0
        self.leg_variables = []

    def initialize_evaluation(self) -> None:
        self.bus_penalty = 0
        self.drive_time = 0
        self.change = 0
        self.split = 0
        self.ride = 0

    def calculate_shift_times(self):
        first_leg = self.employee.legs[0]
        self.start_shift = first_leg.start - self.employee.instance.start_work[first_leg.start_pos]
        last_leg = self.employee.legs[-1]
        self.end_shift = last_leg.end + self.employee.instance.end_work[last_leg.end_pos]
        self.total_time = self.end_shift - self.start_shift

    def compute_leg_variables(self):
        self.legs_assigned = []
        for key, _ in enumerate(self.employee.legs[:-1]):
            leg_i = self.employee.legs[key]
            leg_j = self.employee.legs[key+1]
            i = int(leg_i.end_pos)
            j = int(leg_j.start_pos)
            ride = self.employee.instance.get_passive_ride(i, j)
            diff = leg_j.start - leg_i.end
            diff_1 = diff - ride
            self.leg_variables.append((leg_i, leg_j, i, j, ride, diff, diff_1))



    def calculate_drive_time(self) -> int:
        drive_time = 0
        for leg_i, _, _, _, _, _, _ in self.leg_variables:
            drive_time += leg_i.drive
        return drive_time + self.employee.legs[-1].drive

    def evaluate_ride_time(self) -> None:
        """ Evaluate the ride time of the employee """
        self.ride = 0
        for _, _, _, _, ride, _, _ in self.leg_variables:
            self.ride += ride

    def evaluate_bus_penalty(self) -> None:
        """ Evaluate the bus penalty of the employee """
        self.bus_penalty = 0
        for leg_i, leg_j, i, j, _, diff, _ in self.leg_variables:
            if leg_i.tour != leg_j.tour or leg_i.end_pos != leg_j.start_pos:
                if diff < self.employee.instance.distance_matrix[i][j]:
                    self.bus_penalty += abs(diff - self.employee.instance.distance_matrix[i][j])
                elif diff <= 0:
                    self.bus_penalty += abs(diff)
    
    def evaluate_change(self) -> None:
        """ Evaluate the number of vehicle changes of the employee """
        for leg_i, leg_j, _, _, _, _, _ in self.leg_variables:
            if leg_i.tour != leg_j.tour:
                self.change += 1

    def evaluate_drive_penalties(self) -> None:
        """ Check whether every 4 hours of driving time, the employee has 
        - 1 driving rest of 30 minutes
        - 2 driving rests of 20 minutes
        - 3 driving rests of 15 minutes        """
        penalty = 0
        new_block = False
        b_20 = 0
        b_15 = 0
        dc = self.employee.legs[0].drive
        for _, leg_j, _, _, _, diff, _ in self.leg_variables:
            new_block = (diff >= 30) or (diff >= 20 and b_20 == 1) or (diff >= 15 and b_15 == 2)
            if new_block:
                dc = leg_j.drive
                b_20 = 0
                b_15 = 0
            else:
                dc += leg_j.drive
                if diff >= 20:
                    b_20 = 1
                if diff >= 15:
                    b_15 += 1
            if dc >= 4*60:
                penalty += (dc - 4*60)
        self.drive_penalty = penalty
    
    def evaluate_rest_penalty(self):
            """ Evaluate the number of minutes that violates the rest break rules:
                - If work time is less than 6 hours --> return 0
                - If employees breaks last less than 30 minute --> return max(0, work_time - 6*60-1)
                - Else If you do less than 45 minute break --> return max(0, work_time - 9*60) 

            Args:
                None

            Returns:
                None
            """
            self.rest_penalty = 0
            rest_time = 0
            if self.work_time < 6*60:
                return 
            if self.break30 and self.first15:
                for _, _, _, _, _, _, diff_1 in self.leg_variables:
                    if diff_1 >= 3*60:
                        continue
                    elif diff_1 >= 15:
                        rest_time += diff_1
            if rest_time < 30:
                self.rest_penalty = max(0, self.work_time - (6*60 - 1))
            elif rest_time < 45:
                self.rest_penalty = max(0, self.work_time - 9*60)

    def evaluate_first15(self) -> None:
        """ Check if there is a rest break of 15 minutes in the first 6 hours of work """
        split_time = 0
        self.first15 = False
        for leg_i, _, _, _, _, _, diff_1 in self.leg_variables:
            if diff_1 >= 180:
                split_time += diff_1
                continue
            if diff_1 >= 15 and leg_i.end <= self.start_shift + 6*60 + split_time:
                self.first15 = True     
                return  

    def evaluate_break30(self) -> None:
        """ check if there is a rest break of 30 minutes in the first 6 hours of work """
        for _, _, _, _, _, _, diff_1 in self.leg_variables:
            if diff_1 >= 180:
                continue
            if diff_1 >= 30:
                self.break30 = True
                return 


    def evaluate_working_regulations(self) -> None:
        self.evaluate_first15()
        self.evaluate_break30()
        self.evaluate_unpaid()
        self.evaluate_upmax()
        self.evaluate_split()

    def evaluate_unpaid(self) -> None:
        """ Evaluate the number of minutes of unpaid breaks
        """
        for leg_i, leg_j, i, j, ride, diff, diff_1 in self.leg_variables:

            if diff_1 >= 180:
                continue
            if min(self.end_shift - 3*60, leg_j.start - ride) - max(self.start_shift + 3*60, leg_i.end) >= 30:
                self.center30 = True
            breakEnd = min(self.end_shift - 2*60, leg_j.start - ride)
            breakStart = max(self.start_shift + 2*60, leg_i.end)
            if breakEnd - breakStart >= 15:
                self.unpaid += breakEnd - breakStart
        
    def evaluate_upmax(self):
        """ Evaluate the number of minutes of unpaid breaks.
        Why we need that? Unpaid = min(unpaid, upmax)
        If break30 is False or first15 is False --> upmax = 0
        If center30 is True --> upmax = 90
        If center30 is False but break30 and first15 are True --> upmax = 60
        """
        if self.break30 is False or self.first15 is False:
            self.upmax = 0
        elif self.center30:
            self.upmax = 90
        else:               
            self.upmax = 60

    def evaluate_split(self) -> None:
        for _, _, _, _, _, _, diff_1 in self.leg_variables:
            if diff_1 >= 180:
                self.split += 1
                self.split_time += diff_1

    def evaluate_objective(self) -> None:
        self.actual_work_time = max(self.work_time, 390)
        self.objective = 2*self.actual_work_time + self.total_time \
                         + self.ride + 30*self.change + 180*self.split

    def evaluate_hard_constraints(self) -> int:    
        return 1000*(self.bus_penalty +
                        max(self.drive_time - EMPLOYEE_D_MAX, 0) +
                        max(self.total_time - EMPLOYEE_T_MAX, 0) +
                        self.drive_penalty + self.rest_penalty +
                        max(self.work_time - EMPLOYEE_W_MAX, 0)
                        )

    def evaluate(self):
        if not self.employee.legs:
            return 0

        self.initialize_evaluation()
        self.compute_leg_variables()
        self.calculate_shift_times()

        self.drive_time = self.calculate_drive_time()
        self.evaluate_ride_time()
        self.evaluate_bus_penalty()
        self.evaluate_change()
        self.evaluate_drive_penalties()
        self.evaluate_working_regulations()
       
        self.work_time = self.total_time - self.split_time - min(self.unpaid, self.upmax)
        self.evaluate_rest_penalty()

        self.evaluate_objective()
        hard_constraints = self.evaluate_hard_constraints()

        if hard_constraints > 0:
            self.feasible = False

        return hard_constraints + self.objective


    def copy(self):
        employee_copy = self.employee.copy()
        new_state = State(employee_copy)
        new_state.__dict__.update(self.__dict__)
        return new_state

