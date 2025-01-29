import pandas as pd

df_1 = pd.read_csv('BKS_realistic_1.csv')

# for each row get the minimum value of the row  among BP	SA	HC	TS	CMSA	LNS

df_1['BKS'] = df_1[['BP', 'SA', 'HC', 'TS', 'CMSA', 'LNS']].min(axis=1)

# get gap: (BKS - bound) / BKS * 100

df_1['gap'] = (df_1['BKS'] - df_1['bound']) / df_1['BKS'] * 100
# use 2 decimal places
df_1['gap'] = df_1['gap'].round(2)
# store the winning column name in a new column called algorithm

df_1['algorithm'] = df_1[['BP', 'SA', 'HC', 'TS', 'CMSA', 'LNS']].idxmin(axis=1)

# only consider n_tours	n_legs, BKS and bound

df_1 = df_1[['Instances', 'n_tours', 'n_legs', 'BKS', 'bound', 'gap', 'algorithm']]
df_1.to_html('BKS_realistic_1.html', index=False)