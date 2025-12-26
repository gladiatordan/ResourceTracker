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
				r.res_weight_rating,
				r.res_oq, 
				r.res_oq_rating,
				r.res_cr,
				r.res_cr_rating,
				r.res_cd, 
				r.res_cd_rating,
				r.res_dr, 
				r.res_dr_rating,
				r.res_fl, 
				r.res_fl_rating,
				r.res_hr, 
				r.res_hr_rating,
				r.res_ma, 
				r.res_ma_rating,
				r.res_pe, 
				r.res_pe_rating,
				r.res_sr,
				r.res_sr_rating,
				r.res_ut,
				r.res_ut_rating,
				r.is_active,
				r.date_reported::date as date_reported,
				r.notes
			FROM resource_spawns_test r
			JOIN resource_taxonomy t ON r.resource_class_id = t.swg_index;
		"""
		
		cur.execute(query)
		resources = cur.fetchall()
		cur.close()
		
		return jsonify(resources)
	except Exception as e:
		print("Database error:", e)
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


@app.route('/api/update-resource', methods=['POST'])
def update_resource():
	data = request.get_json()
	conn = get_db_connection()
	cur = conn.cursor()

	# TODO - UPDATE RESOURCE WEIGHTS HERE
	
	# Update resource quantities based on the provided data
	cur.execute(
		"""
		UPDATE resource_spawns_test 
		SET res_oq = %s, res_cr = %s, res_cd = %s, res_dr = %s, res_fl = %s, 
			res_hr = %s, res_ma = %s, res_pe = %s, res_sr = %s, res_ut = %s
		WHERE name = %s
		""",
		(
			data['res_oq'], data['res_cr'], data['res_cd'], data['res_dr'], data['res_fl'],
			data['res_hr'], data['res_ma'], data['res_pe'], data['res_sr'], data['res_ut'],
			data['name']
		)
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
	# print("UPDATE resource_spawns_test SET planet = %s WHERE name = %s", (, data['name']))
	cur.execute(
		"UPDATE resource_spawns_test SET planet = %s::TEXT[] WHERE name = %s",
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

	query = f"""
		SELECT 
			r.name,
			t.class_label as type,
			r.planet as planets,
			r.res_weight_rating,
			r.res_oq, 
			r.res_oq_rating,
			r.res_cr,
			r.res_cr_rating,
			r.res_cd, 
			r.res_cd_rating,
			r.res_dr, 
			r.res_dr_rating,
			r.res_fl, 
			r.res_fl_rating,
			r.res_hr, 
			r.res_hr_rating,
			r.res_ma, 
			r.res_ma_rating,
			r.res_pe, 
			r.res_pe_rating,
			r.res_sr,
			r.res_sr_rating,
			r.res_ut,
			r.res_ut_rating,
			r.is_active,
			r.date_reported::date as date_reported,
			r.notes
		FROM resource_spawns_test r
		JOIN resource_taxonomy t ON r.resource_class_id = t.swg_index
		WHERE r.name = '{name}';
	"""
	cur.execute(query)
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