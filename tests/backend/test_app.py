from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from src.app import activities, app


INITIAL_ACTIVITIES = deepcopy(activities)


@pytest.fixture(autouse=True)
def reset_activities():
    activities.clear()
    activities.update(deepcopy(INITIAL_ACTIVITIES))
    yield
    activities.clear()
    activities.update(deepcopy(INITIAL_ACTIVITIES))


@pytest.fixture
def client():
    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client


def test_root_redirects_to_static_index(client):
    response = client.get("/")

    assert response.status_code == 307
    assert response.headers["location"] == "/static/index.html"


def test_get_activities_returns_activity_details(client):
    response = client.get("/activities")

    assert response.status_code == 200
    data = response.json()
    assert set(data) == set(INITIAL_ACTIVITIES)
    assert data["Chess Club"] == INITIAL_ACTIVITIES["Chess Club"]


def test_signup_adds_student_to_activity(client):
    email = "student@mergington.edu"

    response = client.post(
        "/activities/Basketball Team/signup", params={"email": email}
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": f"Signed up {email} for Basketball Team"
    }
    assert email in activities["Basketball Team"]["participants"]


def test_signup_rejects_duplicate_student(client):
    email = "michael@mergington.edu"

    response = client.post(
        "/activities/Chess Club/signup", params={"email": email}
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Student already signed up for this activity"
    }


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/activities/Unknown Club/signup"),
        ("delete", "/activities/Unknown Club/participants"),
    ],
)
def test_activity_not_found(client, method, path):
    response = getattr(client, method)(path, params={"email": "student@example.com"})

    assert response.status_code == 404
    assert response.json() == {"detail": "Activity not found"}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/activities/Chess Club/signup"),
        ("delete", "/activities/Chess Club/participants"),
    ],
)
def test_email_is_required(client, method, path):
    response = getattr(client, method)(path)

    assert response.status_code == 422


def test_unregister_removes_student_from_activity(client):
    email = "michael@mergington.edu"

    response = client.delete(
        "/activities/Chess Club/participants", params={"email": email}
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": f"Unregistered {email} from Chess Club"
    }
    assert email not in activities["Chess Club"]["participants"]


def test_unregister_rejects_student_not_registered(client):
    response = client.delete(
        "/activities/Chess Club/participants",
        params={"email": "student@mergington.edu"},
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Student not registered for this activity"
    }