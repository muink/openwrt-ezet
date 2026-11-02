#!/bin/sh

NAME="ezet"

log_max_size="30" #KB
main_log_file="/var/run/$NAME/$NAME.log"
ezco_log_file="/var/run/$NAME/easytier-core.log"
ezwe_log_file="/var/run/$NAME/easytier-web.log"

while true; do
	sleep 180
	for i in "$main_log_file" "$ezco_log_file" "$ezwe_log_file"; do
		[ -s "$i" ] || continue
		[ "$(( $(ls -l "$i" | awk -F ' ' '{print $5}') / 1024 >= log_max_size))" -eq "0" ] || echo "" > "$i"
	done
done
