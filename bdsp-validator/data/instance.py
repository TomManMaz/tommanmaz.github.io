from __future__ import annotations
from re import S
from turtle import distance
from sortedcontainers import SortedList
from pathlib import Path
import csv
import os

from data.busleg import BusLeg
import json

class Instance:
    """This class represents the instance of the BDSP problem.
    """

    def __init__(self, legs: SortedList, distance_matrix: list, start_work: float, end_work: float) -> None:
        self.legs = legs
        self.distance_matrix = distance_matrix
        self.start_work = start_work
        self.end_work = end_work
        self.start_shifts = 0
        self.end_shifts = 0
        self.tours = []
        # self.BKS = None
        # self.LB = None
        # self.BH = None
        self.name: str = None



    @staticmethod
    def from_file(filename: str, distance_file: str, extra_file: str) -> Instance:
        """Read from file

        Parameters
        ----------
        file : str


        Returns
        -------
        Instance
            Instance returned.
        """
        # look for the folder of filename
        instance_folder = os.path.dirname(filename)
        instance_name = filename.split('/')[-1].split('.')[0]
        # instance_folder = Path.home() / 'busdriverschedulingproblem' / 'files' / 'instances'
        name = filename
        with open(f'{filename}', 'r') as csv_file:
            csv_reader = csv.reader(csv_file, delimiter=',',
                                    quoting=csv.QUOTE_NONNUMERIC)
            bus_legs = SortedList()
            tours = []
            next(csv_file)
            for line_counter, row in enumerate(csv_reader):
                bus_legs.add(BusLeg(id=line_counter,
                                    tour=int(row[0]),
                                    start=int(row[1]),
                                    end=int(row[2]),
                                    start_pos=int(row[3]),
                                    end_pos=int(row[4])))
                if row[0] not in tours:
                    tours.append(int(row[0]))

        # Read distance matrix 
        with open(distance_file, 'r') as f:
            csv_reader = csv.reader(f, delimiter=',',
                                    quoting=csv.QUOTE_NONNUMERIC)
            distance_matrix = list(csv_reader)

        # Read start and end work times
        with open(extra_file, 'r') as csv_file_extra:
            csv_reader = csv.reader(csv_file_extra, delimiter=',',
                                    quoting=csv.QUOTE_NONNUMERIC)
            start_work = next(csv_reader)
            start_work = [int(x) for x in start_work]
            end_work = next(csv_reader)
            end_work = [int(x) for x in end_work]

        # Read LB, BKS and BH from BKS.csv
        instance = Instance(bus_legs, distance_matrix, start_work, end_work)
        # bks_path = Path.home() / 'busdriverschedulingproblem' / 'BKS.csv'
        # with bks_path.open('r') as csv_file:
        #     csv_reader = csv.reader(csv_file, delimiter=',')
        #     for row in csv_reader:
        #         if row[0] == file:
        #             instance.LB = float(row[1])
        #             instance.BKS = int(row[2])
        #             instance.BH = int(row[3])

        # Calculate start and end shifts
        instance.start_shifts = min(leg.start for leg in instance.legs)
        instance.end_shifts = max(leg.end for leg in instance.legs)
        instance.tours = sorted(tours)
        instance.name = instance_name

        return instance

    def get_index(self, leg: BusLeg) -> int:
        """get the index of the leg w.r.t. the instance

        Parameters
        ----------
        leg : BusLeg
            leg considered

        Returns
        -------
        int
            index of the leg. I.e., if legs=[*,*,*,leg], then get_index(leg) = 3
        """
        return self.legs.index(leg)


    def get_passive_ride(self, i: int, j: int) -> int:
        """Return the passive ride time between positions i and j

        Parameters
        ----------
        i : int
            initial position
        j : int
            final position

        Returns
        -------
        int
            time it takes a driver to get from i to j when not actively driving a bus
        """
        return 0 if i == j else self.distance_matrix[i][j]

    def get_diff(self, i:int, j:int) -> int:
        for leg1 in self.legs:
            for leg2 in self.legs:
                if leg1.id == i and leg2.id == j:
                    return leg2.start - leg1.end

    def evaluate_LB(self) -> float:
        """Evaluate the lower bound of the instance

        Returns
        -------
        float
            lower bound of the instance
        """
        return sum(3*leg.drive for leg in self.legs)
        
    def distance_to_dict(self) -> dict:
        """Create a dictionary distances with index the indexes of the position.
        The items are dictionary itself with keys the indexes of the position and values the corresponding distances.
        """
        distances = {i: {j: self.distance_matrix[i][j] for j in range(len(self.distance_matrix[i]))} for i in range(len(self.distance_matrix))}
        return distances

    def extra_to_dict(self) -> dict:
        """Create a dictionary extra with index the indexes of start_work and end_work.
        The items are dictionary itself with keys "startWork" and "endWork" and values the corresponding values.
        """

        extra = {i: {"startWork": self.start_work[i], "endWork": self.end_work[i]} for i in range(len(self.start_work))}
        return extra

    @staticmethod
    def from_json(filename: str) -> Instance:
        """Read from json file

        Parameters
        ----------
        input_file : str
            path to the json file

        Returns
        -------
        Instance
            Instance returned.

        """
        legs = SortedList()
        with open(filename, 'r') as f:
            data = json.load(f)
            tours = []
            for iteration, item in enumerate(data['legs']):
                leg = BusLeg(id=iteration, 
                             tour=item['tour'], 
                             start=item['start'], 
                             end=item['end'], 
                             start_pos=item['startPos'], 
                             end_pos=item['endPos'])
                if item['tour'] not in tours:
                    tours.append(int(item['tour']))
                legs.add(leg)
            distance_matrix = [[] for _ in range(len(data['distances']))]

            for position, row in data['distances'].items():
                distance_matrix[int(position)] = list(row.values())
            start_work = [position["startWork"] for position in data['extra'].values()]
            end_work = [position["endWork"] for position in data['extra'].values()]
            instance = Instance(legs, distance_matrix, start_work, end_work)
            instance.start_shifts = min(leg.start for leg in instance.legs)
            instance.end_shifts = max(leg.end for leg in instance.legs)
            instance.tours = sorted(tours)
            instance.name = filename.split('/')[-1].split('.')[0]
            return instance

    def to_json(self, output_file: str = None) -> None:

        extra = self.extra_to_dict()
        distances = self.distance_to_dict()
        # create output_file directory if it does not exist
        if output_file is not None:
            Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        output = {}
        output["legs"] = [leg.as_dict() for leg in self.legs]
        output["distances"] = distances.copy()
        output["extra"] = extra.copy()

        if output_file is None:
            print(json.dumps(output, indent=3))
        else:
            with open(output_file, "w") as f:
                json.dump(output, f, indent=3)


    def to_csv(self, path: str) -> None:
        """ Create 3 files:
        - filename.csv: contains the legs
        - filename_distances.csv: contains the distance matrix
        - filename_extra.csv: contains the start and end work times

        save them in the path directory
        
        Parameters
        ----------
        
        output_file : str
            name of the file
        """

        if self.name is None:
            raise ValueError('Instance name is not defined')
        
        # remove .csv from output_file
        output_file = os.path.join(path, self.name)
        with open(f'{output_file}.csv', 'w') as f:
            f.write('tour,start,end,startPos,endPos\n')
            for leg in self.legs:
                f.write(
                    f'{leg.tour},{leg.start},{leg.end},{leg.start_pos},{leg.end_pos}\n'
                    )
        with open(f'{output_file}_dist.csv', 'w') as f:
            # write integer values in the distance matrix
            for row in self.distance_matrix:
                integer_row = [int(x) for x in row]
                f.write(','.join(map(str, integer_row)) + '\n')
            

        with open(f'{output_file}_extra.csv', 'w') as f:
            f.write(','.join(map(str, self.start_work)) + '\n')
            f.write(','.join(map(str, self.end_work)) + '\n')