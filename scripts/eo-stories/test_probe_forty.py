import importlib.util
from pathlib import Path
import unittest
import numpy as np
spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('probe-forty.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class ForTyV1Tests(unittest.TestCase):
    def test_zero_is_valid_other_land(self):
        self.assertEqual(probe.classify_v1(np.zeros((5, 1), dtype=np.uint8))[0], 5)
    def test_partial_nodata_is_masked(self):
        a = np.zeros((5, 1), dtype=np.uint8); a[2] = 255
        self.assertEqual(probe.classify_v1(a)[0], -1)
    def test_sum_widens_before_validation(self):
        with self.assertRaises(ValueError):
            probe.classify_v1(np.full((5, 1), 100, dtype=np.uint8))
    def test_winning_class_and_complement(self):
        a = np.array([[120, 25], [100, 25], [0, 25], [0, 25], [0, 25]], dtype=np.uint8)
        np.testing.assert_array_equal(probe.classify_v1(a), [0, 5])
    def test_rejects_v2(self):
        with self.assertRaises(ValueError):
            probe.classify_v1(np.zeros((7, 1)))
    def test_rejects_reserved_values(self):
        with self.assertRaises(ValueError):
            probe.classify_v1(np.full((5, 1), 251))

if __name__ == '__main__':
    unittest.main()
