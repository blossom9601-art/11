"""Lumina CLI — Agent Management Commands

Usage:
  lumina agent list               List all agents
  lumina agent show <id>          Show agent details
  lumina agent status <id>        Show agent status
  lumina agent find               Search agents
  lumina agent inventory <id>     Show asset inventory
  lumina agent health <id>        Health check
  lumina agent enable <id>        Enable agent
  lumina agent disable <id>       Disable agent
  lumina agent resend <id>        Resend command
  lumina agent collect <id>       Collect command
"""

from __future__ import annotations

import click

from lumina_cli.api_client import LuminaClient, APIError
from lumina_cli.output import (
    print_table,
    print_json,
    print_detail,
    print_inventory,
    print_error,
    print_success,
)


def _get_client() -> LuminaClient:
    return LuminaClient()


# ── Agent List Columns ───────────────────────────────────
_AGENT_LIST_COLUMNS = [
    {"key": "id",              "label": "ID",          "width": 5},
    {"key": "hostname",        "label": "Hostname",    "width": 20},
    {"key": "ip_address",      "label": "IP",          "width": 16},
    {"key": "os_type",         "label": "OS",          "width": 12},
    {"key": "status",          "label": "Status",      "width": 10},
    {"key": "linked",          "label": "Linked",      "width": 10},
    {"key": "last_heartbeat",  "label": "Latest Sync", "width": 20},
]


@click.group("agent")
def agent_group():
    """Agent management and monitoring"""
    pass


# ── lumina agent list ────────────────────────────────────

@agent_group.command("list")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def agent_list(as_json):
    """List all registered agents."""
    try:
        client = _get_client()
        data = client.agent_list()
        rows = data.get("rows", [])

        for r in rows:
            r["linked"] = "Linked" if r.get("linked") else "Unlinked"

        if as_json:
            print_json(data)
        else:
            print_table(rows, _AGENT_LIST_COLUMNS, title="Agent List")
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent show ────────────────────────────────────

@agent_group.command("show")
@click.argument("agent_id", type=int)
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def agent_show(agent_id, as_json):
    """Show agent details."""
    try:
        client = _get_client()
        data = client.agent_show(agent_id)
        item = data.get("item", {})

        if as_json:
            print_json(data)
        else:
            display = {
                "Agent ID": item.get("id"),
                "Hostname": item.get("hostname"),
                "FQDN": item.get("fqdn") or "-",
                "IP Address": item.get("ip_address"),
                "OS Type": item.get("os_type"),
                "OS Version": item.get("os_version"),
                "Status": item.get("status"),
                "Linked": "Yes" if item.get("linked") else "No",
                "Linked Asset": item.get("linked_asset_id") or "-",
                "Enabled": "Yes" if item.get("is_enabled", 1) else "No",
                "Registered": item.get("received_at"),
                "Latest Sync": item.get("last_heartbeat") or "-",
                "Error Count": item.get("error_count", 0),
            }
            print_detail(display, title=f"Agent #{agent_id} Detail")
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent status ──────────────────────────────────

@agent_group.command("status")
@click.argument("agent_id", type=int)
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def agent_status(agent_id, as_json):
    """Show agent status."""
    try:
        client = _get_client()
        data = client.agent_status(agent_id)
        item = data.get("item", {})

        if as_json:
            print_json(data)
        else:
            display = {
                "Agent ID": item.get("id"),
                "Hostname": item.get("hostname"),
                "IP Address": item.get("ip_address"),
                "Status": item.get("status"),
                "Enabled": "Yes" if item.get("is_enabled", 1) else "No",
                "Linked Asset": item.get("linked_asset_id") or "-",
                "Latest Sync": item.get("last_heartbeat") or "-",
                "Error Count": item.get("error_count", 0),
                "Error Message": item.get("error_message") or "-",
            }
            print_detail(display, title=f"Agent #{agent_id} Status")
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent find ────────────────────────────────────

@agent_group.command("find")
@click.option("--hostname", "-h", default=None, help="Search by hostname")
@click.option("--ip", "-i", default=None, help="Search by IP address")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def agent_find(hostname, ip, as_json):
    """Search for agents by hostname or IP."""
    if not hostname and not ip:
        print_error("Specify --hostname or --ip option.")
        raise SystemExit(1)
    try:
        client = _get_client()
        data = client.agent_search(hostname=hostname, ip=ip)
        rows = data.get("rows", [])

        for r in rows:
            r["linked"] = "Linked" if r.get("linked") else "Unlinked"

        if as_json:
            print_json(data)
        else:
            title = "Search Results"
            if hostname:
                title += f" (hostname: {hostname})"
            if ip:
                title += f" (ip: {ip})"
            print_table(rows, _AGENT_LIST_COLUMNS, title=title)
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent inventory ───────────────────────────────

@agent_group.command("inventory")
@click.argument("agent_id", type=int)
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
@click.option("--detail", "show_detail", is_flag=True, help="Detailed view")
def agent_inv(agent_id, as_json, show_detail):
    """Show linked asset inventory for an agent."""
    try:
        client = _get_client()
        data = client.agent_inventory(agent_id)
        item = data.get("item", {})

        if as_json:
            print_json(data)
        else:
            agent_info = item.get("agent", {})
            inventory = item.get("inventory")
            message = item.get("message")

            click.echo(f"\n{'=' * 50}")
            click.echo(f"  Agent #{agent_id} Inventory")
            click.echo(f"  Host: {agent_info.get('hostname', '-')}")
            click.echo(f"{'=' * 50}")

            if message:
                click.echo(f"\n  {message}")
                return

            if inventory:
                print_inventory(inventory)
            else:
                click.echo("\n  No linked asset data found.")

            click.echo()
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent health ──────────────────────────────────

@agent_group.command("health")
@click.argument("agent_id", type=int)
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def agent_health(agent_id, as_json):
    """Show agent health check information."""
    try:
        client = _get_client()
        data = client.agent_health(agent_id)
        item = data.get("item", {})

        if as_json:
            print_json(data)
        else:
            display = {
                "Agent ID": item.get("id"),
                "Hostname": item.get("hostname"),
                "Status": item.get("status"),
                "Last Heartbeat": item.get("last_heartbeat") or "-",
                "Last Collect": item.get("last_collect") or "-",
                "Last Send": item.get("last_send") or "-",
                "Queue Depth": item.get("queue_depth", 0),
                "Error Count": item.get("error_count", 0),
                "Error Message": item.get("error_message") or "-",
            }
            print_detail(display, title=f"Agent #{agent_id} Health")
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent enable ──────────────────────────────────

@agent_group.command("enable")
@click.argument("agent_id", type=int)
def agent_enable(agent_id):
    """Enable an agent."""
    try:
        client = _get_client()
        data = client.agent_enable(agent_id)
        print_success(data.get("message", f"Agent {agent_id} enabled."))
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent disable ─────────────────────────────────

@agent_group.command("disable")
@click.argument("agent_id", type=int)
@click.confirmation_option(prompt="Are you sure you want to disable this agent?")
def agent_disable(agent_id):
    """Disable an agent."""
    try:
        client = _get_client()
        data = client.agent_disable(agent_id)
        print_success(data.get("message", f"Agent {agent_id} disabled."))
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent resend ──────────────────────────────────

@agent_group.command("resend")
@click.argument("agent_id", type=int)
def agent_resend(agent_id):
    """Send a resend command to an agent."""
    try:
        client = _get_client()
        data = client.agent_resend(agent_id)
        print_success(data.get("message", f"Resend command queued for agent {agent_id}."))
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina agent collect ─────────────────────────────────

@agent_group.command("collect")
@click.argument("agent_id", type=int)
def agent_collect(agent_id):
    """Send a collect command to an agent."""
    try:
        client = _get_client()
        data = client.agent_collect(agent_id)
        print_success(data.get("message", f"Collect command queued for agent {agent_id}."))
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)
