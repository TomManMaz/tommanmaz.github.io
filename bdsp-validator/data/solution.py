from __future__ import annotations
from typing import List
from pathlib import Path

import csv
import os 

from data.employee import Employee
from data.instance import Instance


class Solution:
    """Solution class, represented by a list of employees
    """

    def __init__(self, employees: List[Employee]) -> None:
        if not employees:
            self.employees = []
            self.instance = None
        else:
            self.employees = employees
            self.instance = employees[0].instance
        self.value = 0
        self.change = 0
        self.changing_employees = set()
        self.changing_buslegs = set()
        self.feasible = True

    def evaluate_gap(self) -> float:
        """Evaluate the GAP of the solution

        Returns
        -------
        float
            GAP of the solution from the best known solution
        """
        if self.instance.BKS is None:
            return 'NA'
        return (self.value - self.instance.BKS) / self.instance.BKS*100

    def __iter__(self):
        return iter(self.employees)

    def copy(self) -> Solution:
        """Copy the current solution

        Returns
        -------
        Solution
            Solution copied
        """
        employees_copy = [e.copy() for e in self.employees]
        output = Solution(employees_copy)
        output.value = self.value
        return output

    def set(self, solution: Solution) -> None:
        """Set the solution to the solution given as the argument

        Parameters
        ----------
        solution : Solution
            New solution.
        """
        self.employees = solution.employees    
        self.value = solution.value
        self.change = solution.change
    
    def evaluate(self) -> None:
        """Evaluate the solution
        """
        self.value = 0
        self.feasible = True
        for employee in self.employees:
            self.value += employee.evaluate()
            if employee.state.feasible is False:
                self.feasible = False

    def print_to_file(self, file: str) -> None:
        """  Print the solution into the given file.  
             
             The output format is a binary matrix n x l where:
                n is the number of employee
                l is the number of bus legs (ordered by start time)
                the element (i,j) is 1 if leg j is assigned to employee i, 0 otherwise.

        Parameters
        ----------
        file : str
            Desired output file
            
        """
        data = [[0 for _ in self.instance.legs] for _ in self.employees] 
        # if not os.path.exists(os.path.dirname(file)):
        #     os.makedirs(os.path.dirname(file))
        with open(file, 'w', newline='') as f:
            writer = csv.writer(f)
            for employee in self.employees:
                for leg in employee.legs:
                    data[employee.id][self.instance.get_index(leg)] = 1
                writer.writerow(data[employee.id])


    @staticmethod
    def from_file(instance: Instance, file: Path) -> Solution:
        """Read a solution from file

        Parameters
        ----------
        instance : Instance
            Instance used to read the solution
        file : str
            name of the file, in the form "realistic_m_n_solution.csv"

        Returns
        -------
        Solution
            Solution readed.
        """
        employees: List[Employee] = []
        counter = 0
        with file.open('r') as f:
            f = csv.reader(f, quoting=csv.QUOTE_NONNUMERIC)
            for row in f:
                row_legs = [index for index, value in enumerate(row) if value == 1]
                if not row_legs:
                    continue
                employee = Employee(counter, instance)
                employee.name = f'E{str(counter)}'
                counter += 1
                employees.append(employee)
                for leg in row_legs:
                    employee.add_leg(instance.legs[leg])
        # employees = sorted(employees, key=lambda x: x.legs[0].start)
        for i, employee in enumerate(employees):
            employee.id = i
            employee.name = f'E{str(i)}'
        return Solution(employees)
    
    

    def represent(self) -> str:
        output = []
        for leg in self.instance.legs:
            for e in self.employees.values():
                if leg in e.legs:
                    output.append(e.id)
        return "".join([f'{str(a)}x' for a in output])
        
    def resort_employees(self) -> None:
        """
        Sort the employee list by the start of their first legs. 
        Empty employees are dropped.
        The sequences are renamed according to the new order.
        """
        intervals = [list(e.legs) for e in self.employees if len(e.legs) > 0]
        intervals.sort(key=lambda seq: seq[0])
        new_employees = []
        for i, _ in enumerate(intervals):
            employee = Employee(str(i), self.instance)
            employee.name = f'E{str(i)}'
            employee.id = i
            for leg in intervals[i]:
                employee.legs.add(leg)
            new_employees.append(employee)
        self.employees = new_employees.copy()


    def print_objective(self, log_file: str=None) -> None:
        """Print the objective function of the solution

        Parameters
        ----------
        instance : Instance
            The instance of the solution
        log_file : str
            The file where the objective function is printed
        """

        header = ['Employee','Feasible',
                  'Objective',"W'",'T','ride','tour','split',
                  'bus_penalty', 'drive_penalty','rest_penalty', 
                  'work_time','rest_breaks','unpaid','upmax','drive_time',
                  'legs']
        data = []
            # if not os.path.exists(log_file):
            #     os.makedirs(log_file)
        with open(log_file, 'w') as f:
            writer = csv.writer(f)
            writer.writerow(header)
            for e in self.employees:
                element = [e.name, 
                     e.state.feasible, 
                     e.objective, 
                     e.state.actual_work_time,
                     e.state.total_time, 
                     e.state.ride, 
                     e.state.change, 
                     e.state.split, 
                     e.state.bus_penalty, 
                     e.state.drive_penalty, 
                     e.state.rest_penalty, 
                     e.state.work_time, 
                     e.state.unpaid, 
                     e.state.upmax,
                     e.state.drive_time,
                     [l for l in e.legs]
                     ]
                writer.writerow(element)
            