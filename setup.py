from setuptools import setup, find_packages

setup(
    name="SWGBuddy",
    version="1.0.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "flask",
        "flask-cors",
        "requests",
        "psycopg2",  # or psycopg2
		"discord.py",
		"watchdog",
        # Add other dependencies here if you want pip to handle them
    ],
	package_data={
		"SWGBuddy": ["static/*", "templates/*", "assets/*"]
	}
)