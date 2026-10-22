"""驗證需求覆蓋、時窗邊界、零費用／零貨量及全域資源限制。"""
import unittest
import pandas as pd
from prompt_optimizer import Optimizer, brute, pack, solve_global


def frame(rows):
    data = []
    for i, r in enumerate(rows):
        row = dict(fee=100, cages=5, load=25, lane='甲乙', temp='常溫', ton=35., cap=20,
                   carrier='甲承運', bd='2026-06-01', bucket=5)
        row.update(r)
        data.append(row)
    return pd.DataFrame(data, index=[str(i) for i in range(len(data))])


class OptimizerTests(unittest.TestCase):
    def test_dp_matches_brute_and_covers_fractional_demand(self):
        for demand in [0, 1, 14, 15, 20, 21, 40, 61]:
            rates = {17.: 80., 18.5: 90., 35.: 100.5}
            cost, mix = pack(demand, rates)
            self.assertAlmostEqual(cost, brute(demand, rates))
            self.assertGreaterEqual(sum((20 if t == 35 else 14) * n for t, n in mix.items()), demand)
        self.assertEqual(pack(14.1, {17.: 10})[0], 20)

    def test_free_capacity_and_fixed_cost(self):
        dd = frame([dict(fee=0, cages=8), dict(fee=100, cages=0), dict(fee=100, cages=5)])
        opt = Optimizer(dd)
        g = opt.groups()[0]
        self.assertEqual(g['demand'], 0)
        self.assertEqual(g['fixed'], 100)
        result = opt.solve(g, 'B')
        self.assertEqual(result['cost'], 100)
        self.assertEqual(result['mix'], {})

    def test_group_boundaries_and_no_invented_rates(self):
        dd = frame([{}, dict(bucket=6), dict(temp='低溫'), dict(lane='甲丙'), dict(bd='2026-06-02')])
        opt = Optimizer(dd)
        self.assertEqual(len(opt.groups()), 5)
        self.assertEqual(len(opt.groups(False)), 4)
        for g in opt.groups():
            self.assertEqual(set(opt.rates(g, 'B')[0]), {35.})

    def test_expensive_model_keeps_current(self):
        dd = frame([dict(fee=10, cages=5), dict(fee=500, cages=5, bucket=6), dict(fee=500, cages=5, bucket=7)])
        opt = Optimizer(dd)
        result = opt.solve(opt.groups()[0], 'B')
        self.assertFalse(result['changed'])
        self.assertEqual(result['cost'], 10)

    def test_minimum_carrier_samples(self):
        dd = frame([dict(fee=1, carrier='單趟低價'), dict(fee=100), dict(fee=100)])
        opt = Optimizer(dd)
        self.assertEqual(opt.cheap[('甲乙', '常溫', 35.)], (100, '甲承運'))

    def test_milp_cap_counts_retained_trips(self):
        dd = frame([dict(fee=1, cages=20), dict(fee=100, cages=14, ton=17., cap=14, bucket=6),
                    dict(fee=100, cages=14, ton=17., cap=14, bucket=7)])
        opt = Optimizer(dd)
        cost, used = solve_global(opt.groups(), opt, cap35=1, keep=True)
        self.assertLessEqual(used, 1)
        self.assertEqual(cost, 201)
        unrestricted, used = solve_global(opt.groups(), opt, keep=True)
        self.assertLess(unrestricted, cost)
        self.assertEqual(used, 3)


if __name__ == '__main__':
    unittest.main()
