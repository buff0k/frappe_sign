app_name = "frappe_sign"
app_title = "Frappe Sign"
app_publisher = "BuFf0k"
app_description = "An integrated e-Signature Application"
app_email = "buff0k@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

add_to_apps_screen = [
    {
        "name": "frappe_sign",
        "logo": "/assets/frappe_sign/images/desktop_icons/frappe_sign_icon.png",
        "title": "Frappe Sign",
        "route": "/frappe_sign",
        "has_permission": "frappe_sign.api.permission.has_app_permission",
    }
]

fixtures = [
    {"dt": "Role", "filters": [["role_name", "in", [
        "Frappe Sign User",
        "Frappe Sign Sender",
        "Frappe Sign Manager",
    ]]]},
    {"dt": "Custom Field", "filters": [["name", "in", [
        "User-frappe_sign_section",
        "User-frappe_sign_signature",
        "User-frappe_sign_initials",
        "User-frappe_sign_signature_type",
        "User-frappe_sign_signature_consent",
        "User-frappe_sign_signature_consent_on",
        "User-frappe_sign_signature_hash",
    ]]]}
]

doctype_js = {
    "Frappe Sign Request": "public/js/frappe_sign_request.js",
    "Frappe Sign Profile": "public/js/frappe_sign_profile.js",
    "Frappe Sign Template": "public/js/frappe_sign_template.js",
}

permission_query_conditions = {
    "Frappe Sign Request": "frappe_sign.permissions.frappe_sign_request_query",
    "Frappe Sign Event": "frappe_sign.permissions.frappe_sign_event_query",
    "Frappe Sign Profile": "frappe_sign.permissions.frappe_sign_profile_query",
    "Frappe Sign Certificate": "frappe_sign.permissions.frappe_sign_certificate_query",
    "Frappe Sign File Hash": "frappe_sign.permissions.frappe_sign_file_hash_query",
}

has_permission = {
    "Frappe Sign Request": "frappe_sign.permissions.has_frappe_sign_request_permission",
    "Frappe Sign Event": "frappe_sign.permissions.has_frappe_sign_event_permission",
    "Frappe Sign Profile": "frappe_sign.permissions.has_frappe_sign_profile_permission",
    "Frappe Sign Certificate": "frappe_sign.permissions.has_frappe_sign_certificate_permission",
    "Frappe Sign File Hash": "frappe_sign.permissions.has_frappe_sign_file_hash_permission",
}

website_route_rules = [
    {
        "from_route": "/sign/<token>",
        "to_route": "frappe_sign_portal",
    },
]

app_include_css = [
    "/assets/frappe_sign/css/frappe_sign.css",
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/frappe_sign/css/frappe_sign.css"
# app_include_js = "/assets/frappe_sign/js/frappe_sign.js"

# include js, css files in header of web template
# web_include_css = "/assets/frappe_sign/css/frappe_sign.css"
# web_include_js = "/assets/frappe_sign/js/frappe_sign.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "frappe_sign/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "frappe_sign/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "frappe_sign.utils.jinja_methods",
# 	"filters": "frappe_sign.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "frappe_sign.install.before_install"
# after_install = "frappe_sign.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "frappe_sign.uninstall.before_uninstall"
# after_uninstall = "frappe_sign.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "frappe_sign.utils.before_app_install"
# after_app_install = "frappe_sign.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "frappe_sign.utils.before_app_uninstall"
# after_app_uninstall = "frappe_sign.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "frappe_sign.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "frappe_sign.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"frappe_sign.tasks.all"
# 	],
# 	"daily": [
# 		"frappe_sign.tasks.daily"
# 	],
# 	"hourly": [
# 		"frappe_sign.tasks.hourly"
# 	],
# 	"weekly": [
# 		"frappe_sign.tasks.weekly"
# 	],
# 	"monthly": [
# 		"frappe_sign.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "frappe_sign.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "frappe_sign.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "frappe_sign.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "frappe_sign.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["frappe_sign.utils.before_request"]
# after_request = ["frappe_sign.utils.after_request"]

# Job Events
# ----------
# before_job = ["frappe_sign.utils.before_job"]
# after_job = ["frappe_sign.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"frappe_sign.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

