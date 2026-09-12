import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    # TestClient as a context manager runs the app's lifespan (registry.load_all()),
    # so every test gets the real pickled models loaded exactly as production would -
    # no mocking the ML layer, since a mock would defeat the point of these tests
    # (catching a stale/corrupt artifact before Render's slower deploy-then-fail loop).
    with TestClient(app) as c:
        yield c


@pytest.fixture
def valid_regression_spec():
    return {
        "displ": 2.0, "cylinders": 4, "year": 2024,
        "drive_s": "FWD", "vclass_s": "Midsize Car", "trany_s": "Automatic", "fuelType1": "Regular Gasoline",
    }
