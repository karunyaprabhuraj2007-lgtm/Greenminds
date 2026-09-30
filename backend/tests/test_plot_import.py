"""Plot import (GeoJSON, KML, zipped shapefile), drawing, editing, deleting."""
import io
import json
import zipfile

import pytest
import shapefile
from pyproj import CRS, Transformer
from sqlalchemy import select

from app.db.models import AuditLog
from tests.conftest import ADMIN, FIELD_ORIGIN, OFFICER, OPERATOR, VERIFIER, auth_header, rect, unit_ids


@pytest.fixture()
def survey(client, tokens, db):
    body = {"name": "Import test", "type": "crop_survey", **unit_ids(db, "Pune", "Baramati"),
            "aoi": rect(FIELD_ORIGIN, 0, 0, 400, 400)}
    return client.post("/api/surveys", json=body, headers=auth_header(tokens, OFFICER)).json()["id"]


def _upload(client, tokens, sid, name, content, email=OFFICER):
    return client.post(f"/api/surveys/{sid}/plots/import", files={"file": (name, content)}, headers=auth_header(tokens, email))


def test_import_geojson_with_attributes(client, tokens, survey, db):
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"plot_code": "G-1", "survey_no": "Gat 12/1"}, "geometry": rect(FIELD_ORIGIN, 10, 10, 100, 100)},
        {"type": "Feature", "properties": {"Name": "G-2"}, "geometry": rect(FIELD_ORIGIN, 150, 10, 100, 50)},
        {"type": "Feature", "properties": {"plot_code": "G-1"}, "geometry": rect(FIELD_ORIGIN, 10, 150, 50, 50)},
        {"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": [74.45, 18.22]}},
    ]}
    res = _upload(client, tokens, survey, "parcels.geojson", json.dumps(fc).encode())
    assert res.status_code == 200, res.text
    body = res.json()
    created = {p["plot_code"]: p for p in body["created"]}
    assert set(created) == {"G-1", "G-2", "G-1-2"}           # duplicate code gets a suffix
    assert created["G-1"]["parcel_ref"] == "Gat 12/1"
    assert created["G-1"]["area_ha"] == pytest.approx(1.0, rel=3e-3)
    assert created["G-2"]["area_ha"] == pytest.approx(0.5, rel=3e-3)
    assert created["G-1"]["source"] == "import:parcels.geojson"
    row = db.scalar(select(AuditLog).where(AuditLog.action == "import", AuditLog.entity_id == survey))
    assert row.after_json["created"] == 3


def test_import_kml_placemarks(client, tokens, survey):
    def ring(geom):
        return " ".join(f"{x},{y},0" for x, y in geom["coordinates"][0])
    placemarks = "".join(
        f"<Placemark><name>K-{i}</name><ExtendedData><Data name='survey_no'><value>{20 + i}</value></Data></ExtendedData>"
        f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{ring(rect(FIELD_ORIGIN, 10 + i * 110, 200, 100, 100))}"
        "</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>"
        for i in range(2)
    )
    kml = f"<?xml version='1.0'?><kml xmlns='http://www.opengis.net/kml/2.2'><Document>{placemarks}</Document></kml>"
    body = _upload(client, tokens, survey, "fields.kml", kml.encode()).json()
    assert [(p["plot_code"], p["parcel_ref"]) for p in body["created"]] == [("K-0", "20"), ("K-1", "21")]


def test_import_zipped_shapefile_in_utm_is_reprojected(client, tokens, survey):
    utm = CRS.from_epsg(32643)
    to_utm = Transformer.from_crs("EPSG:4326", utm, always_xy=True).transform
    x0, y0 = to_utm(*FIELD_ORIGIN)
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    w = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYGON)
    w.field("PLOT_CODE", "C", 20)
    w.field("GAT_NO", "C", 20)
    w.poly([[(x0 + 20, y0 + 20), (x0 + 20, y0 + 220), (x0 + 220, y0 + 220), (x0 + 220, y0 + 20), (x0 + 20, y0 + 20)]])
    w.record("S-1", "301")
    w.close()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("parcels.shp", shp.getvalue())
        z.writestr("parcels.shx", shx.getvalue())
        z.writestr("parcels.dbf", dbf.getvalue())
        z.writestr("parcels.prj", utm.to_wkt("WKT1_ESRI"))
    body = _upload(client, tokens, survey, "parcels.zip", buf.getvalue()).json()
    plot = body["created"][0]
    assert (plot["plot_code"], plot["parcel_ref"]) == ("S-1", "301")
    assert plot["area_ha"] == pytest.approx(4.0, rel=5e-3)  # 200 m x 200 m in UTM


def test_import_rejects_bad_files(client, tokens, survey):
    assert _upload(client, tokens, survey, "notes.txt", b"hello").status_code == 422
    assert _upload(client, tokens, survey, "broken.geojson", b"{nope").status_code == 422
    assert _upload(client, tokens, survey, "points.geojson", json.dumps({"type": "Point", "coordinates": [1, 2]}).encode()).status_code == 422
    assert _upload(client, tokens, survey, "empty.zip", b"PK\x05\x06" + b"\x00" * 18).status_code == 422


def test_import_warns_when_outside_aoi(client, tokens, survey):
    fc = {"type": "Feature", "properties": {"code": "FAR"}, "geometry": rect(FIELD_ORIGIN, 2000, 0, 50, 50)}
    body = _upload(client, tokens, survey, "far.geojson", json.dumps(fc).encode()).json()
    assert body["warnings"] == ["Plot FAR extends outside the survey area."]


def test_draw_edit_delete_plot(client, tokens, survey, db):
    h = auth_header(tokens, OFFICER)
    res = client.post(f"/api/surveys/{survey}/plots", headers=h, json={"geometry": rect(FIELD_ORIGIN, 300, 300, 50, 50), "plot_code": "D-1"})
    assert res.status_code == 201 and res.json()["source"] == "drawn"
    pid = res.json()["id"]
    assert client.post(f"/api/surveys/{survey}/plots", headers=h, json={"geometry": rect(FIELD_ORIGIN, 0, 0, 10, 10), "plot_code": "D-1"}).status_code == 409
    bowtie = {"type": "Polygon", "coordinates": [[[74.45, 18.22], [74.451, 18.221], [74.451, 18.22], [74.45, 18.221], [74.45, 18.22]]]}
    assert client.post(f"/api/surveys/{survey}/plots", headers=h, json={"geometry": bowtie}).status_code == 422
    res = client.patch(f"/api/plots/{pid}", headers=h, json={"geometry": rect(FIELD_ORIGIN, 300, 300, 100, 50), "parcel_ref": "Gat 7"})
    assert res.status_code == 200 and res.json()["area_ha"] == pytest.approx(0.5, rel=3e-3) and res.json()["parcel_ref"] == "Gat 7"
    assert client.delete(f"/api/plots/{pid}", headers=h).status_code == 204
    actions = [r.action for r in db.scalars(select(AuditLog).where(AuditLog.entity_id == pid).order_by(AuditLog.at))]
    assert actions == ["create", "update", "delete"]


def test_plot_edit_permissions(client, tokens, survey, world):
    geom = {"geometry": rect(FIELD_ORIGIN, 0, 0, 20, 20)}
    assert client.post(f"/api/surveys/{survey}/plots", headers=auth_header(tokens, VERIFIER), json=geom).status_code == 403
    assert client.post(f"/api/surveys/{world['nashik']}/plots", headers=auth_header(tokens, OFFICER), json=geom).status_code == 404
    assert client.post(f"/api/surveys/{survey}/plots", headers=auth_header(tokens, ADMIN), json=geom).status_code == 201
    # archived surveys are read-only
    client.patch(f"/api/surveys/{survey}", headers=auth_header(tokens, OFFICER), json={"status": "archived"})
    assert client.post(f"/api/surveys/{survey}/plots", headers=auth_header(tokens, OFFICER), json=geom).status_code == 409


def test_input_aois_listing(client, tokens, tmp_path, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "inputs_dir", tmp_path)
    (tmp_path / "a_field.geojson").write_text(json.dumps(rect(FIELD_ORIGIN, 0, 0, 100, 200)))
    (tmp_path / "b_bad.kml").write_text("<kml>")
    body = client.get("/api/demo/aois", headers=auth_header(tokens, OPERATOR)).json()
    assert body[0]["source"] == "a_field.geojson" and body[0]["area_ha"] == pytest.approx(2.0, rel=3e-3)
    assert body[1]["source"] == "b_bad.kml" and "error" in body[1]
