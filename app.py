from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import json

app = Flask(__name__)
CORS(app) # Allows your frontend to talk to this backend

def get_db_connection():
	with open('config.json') as config_file:
		config = json.load(config_file)
	db_config = config['database']
	
	conn = psycopg2.connect(
		host=db_config['host'],
		port=db_config['port'],
		database=db_config['database'],
		user=db_config['user'],
		password=db_config['password']
	)
	return conn

@app.route('/')
def index():
    return render_template("index.html")


@app.route('/api/resource_log', methods=['GET'])
def queryResourceLog():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Your specific query remains hidden here on the server
        query = """
            SELECT 
                r.name,
                t.class_label as type,
                r.planet as planets,
                r.res_oq, r.res_cd, r.res_dr, r.res_fl, 
                r.res_hr, r.res_ma, r.res_pe, r.res_ut,
                r.is_active,
                r.spawned_at::date as date_reported
            FROM resource_spawns_test r
            JOIN resource_taxonomy t ON r.resource_class_id = t.id;
        """
        
        cur.execute(query)
        resources = cur.fetchall()
        cur.close()
        
        return jsonify(resources)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/update-status', methods=['POST'])
def update_status():
    data = request.json
    conn = get_db_connection()
    cur = conn.cursor()
    # Toggle based on name
    cur.execute(
        "UPDATE resource_spawns_test SET is_active = %s WHERE name = %s",
        (data['is_active'], data['name'])
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"success": True})


@app.route('/api/update-planets', methods=['POST'])
def update_planets():
    data = request.get_json()
    conn = get_db_connection()
    cur = conn.cursor()
    
    # We simply replace the existing array with the toggled list from the frontend
    cur.execute(
        "UPDATE resource_spawns_test SET planet = %s WHERE name = %s",
        (data['planets'], data['name'])
    )
    
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"success": True})


@app.route('/api/resource/<name>')
def get_single_resource(name):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    query = """
        SELECT 
            r.name,
            t.class_label as type,
            r.planet as planets,
            r.res_oq, r.res_cd, r.res_dr, r.res_fl, 
            r.res_hr, r.res_ma, r.res_pe, r.res_ut,
            r.is_active,
            r.spawned_at::date as date_reported
        FROM resource_spawns_test r
        JOIN resource_taxonomy t ON r.resource_class_id = t.id
        WHERE r.name = %s;
    """
    cur.execute(query, (name,))
    resource = cur.fetchone()
    cur.close()
    conn.close()
    return jsonify(resource)

@app.route('/api/taxonomy')
def get_taxonomy():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT id, class_label, parent_id, tree_level 
        FROM resource_taxonomy 
        ORDER BY tree_level, class_label
    """)
    taxonomy = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(taxonomy)


if __name__ == '__main__':
    app.run(debug=True, port=5000)