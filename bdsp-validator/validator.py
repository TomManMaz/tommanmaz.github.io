"""
BDSP Solution Validator

Validates solutions for the Bus Driver Scheduling Problem (BDSP).
Checks feasibility constraints and computes a detailed objective breakdown
per employee (shift).

Usage:
    # Validate a single solution file:
    python validator.py -m file -j instance.json -i solution.csv

    # Validate a single solution and save objective breakdown:
    python validator.py -m file -j instance.json -i solution.csv -o breakdown.csv

    # Validate all solutions in a folder (requires instances/ directory):
    python validator.py -m folder -i solutions/ -o report.csv
"""

from collections import Counter
import os
import argparse
import time
from pathlib import Path
import csv

from data.solution import Solution
from data.instance import Instance
from data.employee import Employee

from utils.logging import get_logger

INSTANCE_FOLDER = Path('instances')


def get_instance_name(file: str) -> str:
    """
    Get the instance name from the solution filename.
    If it is in the form *_realistic_m_n_*, it will return realistic_m_n

    Parameters
    ----------
    file : str
        Solution file

    Returns
    -------
    str
        Instance name
    """
    instance_name = str(file).split('/')[-1]
    if 'realistic' in instance_name:
        index_realistic = instance_name.index('realistic')
        instance_name = instance_name[index_realistic:]
        instance_name = ('_').join(instance_name.split('_')[0:3])

    instance_file = f'{INSTANCE_FOLDER}/{instance_name}.json'
    try:
        instance = Instance.from_json(instance_file)
        instance.name = instance_name
    except FileNotFoundError:
        logger.error(f'Instance file not found for {instance_name}')

    return instance_name


def get_instance_file(instance_name: str) -> str:
    return f'{INSTANCE_FOLDER}/{instance_name}.json'


class FolderValidator:
    def __init__(self, solution_folder: str):
        self.solution_folder = Path(solution_folder)
        self.validation_results = []
        self.output_file = 'validation_report.csv'
        self.solutions = []

    def validate_all(self):
        """Validate all solutions in the folder."""
        solution_files = list(self.solution_folder.glob("*.csv"))
        solution_files.sort()
        logger.info(f'Found {len(solution_files)} solution files in {self.solution_folder}')
        for iteration, solution_file in enumerate(solution_files):
            instance_name = get_instance_name(str(solution_file))
            instance_file = get_instance_file(instance_name)
            logger.info(f'({iteration+1}/{len(solution_files)})\t Starting validation for {solution_file} instance {instance_name}')
            instance = Instance.from_json(instance_file)
            solution = Solution.from_file(instance, solution_file)
            solution.evaluate()
            self.solutions.append(solution)
            validator = Validator(instance, solution_file)
            is_valid = validator.validate()
            self.validation_results.append({
                "filename": solution_file.name,
                "Instances": instance.name,
                "objective": solution.value,
                "feasible": is_valid,
                "errors": validator.errors,
            })
        self.save_report()

    def save_report(self):
        """Save validation results to a CSV file."""
        with open(self.output_file, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["filename", "Instances", "objective", "feasible", "errors"])
            writer.writeheader()
            for result in self.validation_results:
                writer.writerow({
                    "filename": result["filename"],
                    "Instances": result["Instances"],
                    "feasible": result["feasible"],
                    "objective": result["objective"],
                    "errors": "; ".join(result["errors"]),
                })


class Validator:
    def __init__(self, instance: Instance, solution_file: str):
        self.instance = instance
        self.solution = Solution.from_file(instance, solution_file)
        self.solution.evaluate()
        self.errors = []

    def validate_legs(self) -> bool:
        """Validate the legs in the solution."""
        legs_instance = set(self.instance.legs)
        legs_solution = set(leg for employee in self.solution.employees for leg in employee.legs)
        unassigned_legs = legs_instance - legs_solution
        duplicate_legs = [leg for leg, count in Counter(legs_solution).items() if count > 1]

        if unassigned_legs:
            self.errors.append(f'Unassigned legs: {unassigned_legs}')
            return False
        if duplicate_legs:
            self.errors.append(f'Duplicate legs: {duplicate_legs}')
            return False
        return True

    def validate_employees(self) -> bool:
        """Validate the employees in the solution."""
        valid = True
        self.solution.evaluate()
        for employee in self.solution.employees:
            if not employee.state.feasible:
                valid = False
                self.errors.append(f'Employee {employee.name} is not feasible')
        return valid

    def validate_objective(self) -> bool:
        """Validate the objective value of the solution."""
        self.solution.evaluate()
        calculated_value = sum(employee.objective for employee in self.solution.employees)
        if self.solution.value != calculated_value:
            self.errors.append(f'Objective value {self.solution.value} does not match the calculated value {calculated_value}')
            return False
        return True

    def report(self):
        """Print or return a detailed report of validation errors."""
        if self.errors:
            logger.error('Validation errors:')
            for error in self.errors:
                logger.error(error)
        else:
            logger.info('No validation errors found.')

    def validate(self) -> bool:
        """Validate the solution."""
        valid = (
            self.validate_legs() and
            self.validate_employees() and
            self.validate_objective()
        )
        self.report()
        return valid

    def write_objective(self, output_file: str) -> None:
        """Write per-employee objective breakdown to CSV."""
        header = ['Employee', 'Feasible',
                  'Objective', "W'", 'T', 'ride', 'tour', 'split',
                  'bus_penalty', 'drive_penalty', 'rest_penalty',
                  'work_time', 'unpaid', 'upmax', 'drive_time',
                  'legs']
        with open(output_file, 'w') as f:
            writer = csv.writer(f)
            writer.writerow(header)
            for e in self.solution.employees:
                row = [e.name,
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
                writer.writerow(row)
        logger.info(f'Objective values written to {output_file}')

    def get_breakdown(self) -> list:
        """Return per-employee objective breakdown as a list of dicts.

        Used by the website build pipeline to embed breakdown data
        in instances.json.
        """
        rows = []
        for e in self.solution.employees:
            rows.append({
                "employee": e.name,
                "feasible": e.state.feasible,
                "objective": e.objective,
                "work_time_paid": e.state.actual_work_time,
                "total_time": e.state.total_time,
                "ride": e.state.ride,
                "vehicle_changes": e.state.change,
                "split_shifts": e.state.split,
                "drive_time": e.state.drive_time,
                "num_legs": len(e.legs),
            })
        return rows


def parse_arguments() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description='BDSP Solution Validator')
    parser.add_argument('--mode', '-m', required=True, type=str,
                        choices=['file', 'folder'],
                        help='Validation mode: "file" for a single solution, "folder" for batch')
    parser.add_argument('--instance_json', '-j', required=False, type=str,
                        help='Path to instance JSON file (file mode)')
    parser.add_argument('--instance_file', '-inst', required=False, type=str,
                        help='Instance name (auto-resolves to instances/<name>.json)')
    parser.add_argument('--input', '-i', required=True, type=str,
                        help='Solution CSV file (file mode) or folder of CSVs (folder mode)')
    parser.add_argument('--output', '-o', required=False, type=str,
                        help='Output file for objective breakdown (file mode) or report (folder mode)')
    args = parser.parse_args()

    if args.mode == 'file' and not os.path.isfile(args.input):
        raise FileNotFoundError(f"Input file {args.input} does not exist.")
    elif args.mode == 'folder' and not os.path.isdir(args.input):
        raise FileNotFoundError(f"Input folder {args.input} does not exist.")

    return args


def main():
    args = parse_arguments()
    start = time.perf_counter()

    if args.mode == 'file':
        if args.instance_json:
            instance = Instance.from_json(args.instance_json)
        else:
            instance_name = get_instance_name(args.input)
            instance_file = get_instance_file(instance_name)
            instance = Instance.from_json(instance_file)

        logger.info(f'Validating {instance.name}\t filename: {args.input}')
        validator = Validator(instance, Path(args.input))
        validator.validate()
        if args.output:
            validator.write_objective(args.output)

    elif args.mode == 'folder':
        folder_validator = FolderValidator(args.input)
        if args.output:
            folder_validator.output_file = args.output
        folder_validator.validate_all()
        logger.info('Completely finished after %.2f seconds.' % (time.perf_counter() - start))


if __name__ == '__main__':
    logger = get_logger('validator')
    main()
