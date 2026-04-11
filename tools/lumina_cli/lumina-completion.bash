#!/bin/bash
###############################################################################
# Lumina CLI — Bash 자동완성 스크립트
# 설치: /etc/bash_completion.d/lumina
###############################################################################

_lumina_completion() {
    local cur prev words cword
    _init_completion || return

    # Top-level commands
    local top_commands="login logout config agent --help --version"

    # agent subcommands
    local agent_commands="list show status find inventory health enable disable resend collect --help"

    # config subcommands
    local config_commands="show set --help"

    case "${words[1]}" in
        agent)
            case "${words[2]}" in
                list)
                    COMPREPLY=( $(compgen -W "--json --help" -- "${cur}") )
                    ;;
                show|status|health|inventory)
                    COMPREPLY=( $(compgen -W "--json --help" -- "${cur}") )
                    ;;
                find)
                    COMPREPLY=( $(compgen -W "--hostname --ip --json --help" -- "${cur}") )
                    ;;
                enable|disable|resend|collect)
                    COMPREPLY=( $(compgen -W "--help" -- "${cur}") )
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "${agent_commands}" -- "${cur}") )
                    ;;
            esac
            ;;
        config)
            case "${words[2]}" in
                set)
                    if [[ ${cword} -eq 3 ]]; then
                        COMPREPLY=( $(compgen -W "server_url verify_ssl timeout max_retries" -- "${cur}") )
                    fi
                    ;;
                *)
                    COMPREPLY=( $(compgen -W "${config_commands}" -- "${cur}") )
                    ;;
            esac
            ;;
        login)
            COMPREPLY=( $(compgen -W "--server --emp-no --password --help" -- "${cur}") )
            ;;
        *)
            COMPREPLY=( $(compgen -W "${top_commands}" -- "${cur}") )
            ;;
    esac
}

complete -F _lumina_completion lumina
