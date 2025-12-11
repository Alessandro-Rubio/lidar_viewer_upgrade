from laspy import LasReader

path = r"C:\Users\pollo\Documents\GitHub\lidar_viewer_upgrade\backend\data\039_0001_F01C06.laz"

r = LasReader(path)
print("OK puntos:", r.header.point_count)
