#!/bin/sh

for bin in easytier-core easytier-web easytier-cli; do
	mkdir -p $bin 2>/dev/null
	rm -f $bin/*
	subcmds="$($bin -h | tee $bin/main.txt | sed -En '/^Commands:/,/^$/{s|^\s+(\S+).*|\1|p}')"
	for subcmd in $subcmds; do
		$bin $subcmd -h > $bin/$subcmd.txt
	done
done
