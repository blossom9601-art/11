#!/bin/bash
mysql -u lumina_admin -pLuminaAdmin2026Secure lumina -e "SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='lumina' ORDER BY TABLE_NAME;" 2>/dev/null
