
cat-config:
	@base64 -D -i ~/.boloui-config-dev/boloui-config.txt | python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))' | pbcopy
