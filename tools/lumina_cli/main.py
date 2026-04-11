"""Lumina CLI — Main Command Group

Blossom platform agent management CLI tool.
Runs on the AP server, managing agents via REST API.
"""

from __future__ import annotations

import click
import getpass

from lumina_cli import __version__
from lumina_cli.config import (
    load_config,
    save_config,
    update_auth,
    clear_auth,
)
from lumina_cli.api_client import LuminaClient, APIError
from lumina_cli.output import print_error, print_success, print_json
from lumina_cli.commands.agent import agent_group


@click.group()
@click.version_option(version=__version__, prog_name="lumina")
def cli():
    """Lumina — Blossom Agent Management CLI

    \b
    Login first:
      lumina login
    \b
    Query agents:
      lumina agent list
      lumina agent show <id>
      lumina agent find --hostname <name>
    \b
    Details:
      lumina agent inventory <id>
      lumina agent health <id>
    """
    pass


# ── lumina login ─────────────────────────────────────────

@cli.command()
@click.option("--server", "-s", default=None, help="Server URL (e.g. https://192.168.56.105)")
@click.option("--emp-no", "-u", default=None, help="Employee number")
@click.option("--password", "-p", default=None, help="Password (prompts if not given)")
def login(server, emp_no, password):
    """Login to the server and obtain an auth token."""
    cfg = load_config()

    if server:
        cfg["server_url"] = server.rstrip("/")
        save_config(cfg)

    if not emp_no:
        emp_no = click.prompt("Employee No")
    if not password:
        password = getpass.getpass("Password: ")

    try:
        client = LuminaClient(server_url=cfg.get("server_url"))
        data = client.login(emp_no, password)

        if data.get("success"):
            update_auth(
                token=data["token"],
                emp_no=data["emp_no"],
                role=data["role"],
            )
            print_success(f"Login successful — {data['emp_no']} ({data['role']})")
        else:
            print_error(data.get("error", "Login failed"))
            raise SystemExit(1)
    except APIError as e:
        print_error(e.message)
        raise SystemExit(1)


# ── lumina logout ────────────────────────────────────────

@cli.command()
def logout():
    """Logout and delete the stored auth token."""
    clear_auth()
    print_success("Logged out.")


# ── lumina config ────────────────────────────────────────

@cli.group("config")
def config_group():
    """CLI configuration management"""
    pass


@config_group.command("show")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def config_show(as_json):
    """Show current settings."""
    cfg = load_config()
    display_cfg = dict(cfg)
    if display_cfg.get("token"):
        t = display_cfg["token"]
        display_cfg["token"] = t[:8] + "..." + t[-4:] if len(t) > 12 else "***"

    if as_json:
        print_json(display_cfg)
    else:
        click.echo("\nCurrent Settings:")
        click.echo(f"  Server URL  : {display_cfg.get('server_url')}")
        click.echo(f"  SSL Verify  : {display_cfg.get('verify_ssl')}")
        click.echo(f"  Timeout     : {display_cfg.get('timeout')}s")
        click.echo(f"  Max Retries : {display_cfg.get('max_retries')}")
        click.echo(f"  Employee No : {display_cfg.get('emp_no') or '-'}")
        click.echo(f"  Role        : {display_cfg.get('role') or '-'}")
        click.echo(f"  Token       : {display_cfg.get('token', '-')}")
        click.echo()


@config_group.command("set")
@click.argument("key")
@click.argument("value")
def config_set(key, value):
    """Update a configuration value.

    \b
    Available keys:
      server_url    Server URL
      verify_ssl    SSL verification (true/false)
      timeout       Timeout in seconds
      max_retries   Max retry count
    """
    allowed = {"server_url", "verify_ssl", "timeout", "max_retries"}
    if key not in allowed:
        print_error(f"Available keys: {', '.join(sorted(allowed))}")
        raise SystemExit(1)

    cfg = load_config()
    if key == "verify_ssl":
        cfg[key] = value.lower() in ("true", "1", "yes")
    elif key in ("timeout", "max_retries"):
        try:
            cfg[key] = int(value)
        except ValueError:
            print_error(f"{key} must be a number.")
            raise SystemExit(1)
    else:
        cfg[key] = value

    save_config(cfg)
    print_success(f"{key} = {cfg[key]}")


# ── Register subcommands ─────────────────────────────────
cli.add_command(agent_group)


if __name__ == "__main__":
    cli()
