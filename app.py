from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from contextlib import contextmanager

app = Flask(__name__)
CORS(app)

# 1. OPTIMIZATION: Load Config Once at Startup
try:
    with open('config.json') as config_file:
        config = json.load(config_file)
    DB_CONFIG = config['database']
except Exception as e:
    print(f"Error loading config.json: {e}")
    DB_CONFIG = None

# 2. OPTIMIZATION: Define the Base Query Globally (DRY Principle)
BASE_RESOURCE_QUERY = """
    SELECT 
        r.name,
        t.class_label as type,
        r.planet as planets,
        r.res_weight_rating,
        r.res_oq, r.res_oq_rating,
        r.res_cr, r.res_cr_rating,
        r.res_cd, r.res_cd_rating,
        r.res_dr, r.res_dr_rating,
        r.res_fl, r.res_fl_rating,
        r.res_hr, r.res_hr_rating,
        r.res_ma, r.res_ma_rating,
        r.res_pe, r.res_pe_rating,
        r.res_sr, r.res_sr_rating,
        r.res_ut, r.res_ut_rating,
        r.is_active,
        r.date_reported::date as date_reported,
        r.notes
    FROM resource_spawns_test r
    JOIN resource_taxonomy t ON r.resource_class_id = t.swg_index
"""

# 3. OPTIMIZATION: Context Manager for Safe DB Handling
@contextmanager
def get_db_cursor(commit=False):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        yield cur
        if commit:
            conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Database Error: {e}")
        raise e
    finally:
        if conn:
            cur.close()
            conn.close()

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/api/resource_log', methods=['GET'])
def queryResourceLog():
    try:
        with get_db_cursor() as cur:
            # Reuses the global constant
            cur.execute(BASE_RESOURCE_QUERY)
            resources = cur.fetchall()
        return jsonify(resources)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/resource/<name>')
def get_single_resource(name):
    try:
        with get_db_cursor() as cur:
            # Reuses the global constant with a WHERE clause
            query = f"{BASE_RESOURCE_QUERY} WHERE r.name = %s"
            cur.execute(query, (name,))
            resource = cur.fetchone()
        return jsonify(resource)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/update-status', methods=['POST'])
def update_status():
    data = request.json
    try:
        with get_db_cursor(commit=True) as cur:
            cur.execute(
                "UPDATE resource_spawns_test SET is_active = %s WHERE name = %s",
                (data['is_active'], data['name'])
            )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/update-resource', methods=['POST'])
def update_resource():
    data = request.get_json()
    try:
        with get_db_cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE resource_spawns_test 
                SET res_oq = %s, res_cr = %s, res_cd = %s, res_dr = %s, res_fl = %s, 
                    res_hr = %s, res_ma = %s, res_pe = %s, res_sr = %s, res_ut = %s,
                    notes = %s 
                WHERE name = %s
                """,
                (
                    data.get('res_oq'), data.get('res_cr'), data.get('res_cd'), 
                    data.get('res_dr'), data.get('res_fl'), data.get('res_hr'), 
                    data.get('res_ma'), data.get('res_pe'), data.get('res_sr'), 
                    data.get('res_ut'), data.get('notes'), data.get('name')
                )
            )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/update-planets', methods=['POST'])
def update_planets():
    data = request.get_json()
    try:
        with get_db_cursor(commit=True) as cur:
            cur.execute(
                "UPDATE resource_spawns_test SET planet = %s::TEXT[] WHERE name = %s",
                (data['planets'], data['name'])
            )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/taxonomy')
def get_taxonomy():
    try:
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT id, class_label, parent_id, tree_level 
                FROM resource_taxonomy 
                ORDER BY tree_level, class_label
            """)
            taxonomy = cur.fetchall()
        return jsonify(taxonomy)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)