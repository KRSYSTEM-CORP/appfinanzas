cd /opt/kr/src
python3 - <<'PY'
s=open('Dockerfile').read()
if 'NEXT_PUBLIC_SUPABASE_URL' not in s:
    s=s.replace('ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""','ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""\nARG NEXT_PUBLIC_SUPABASE_URL=""\nARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""')
    s=s.replace('NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \\','NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \\\n    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \\\n    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \\')
    open('Dockerfile','w').write(s)
PY
g(){ grep "^$1=" /opt/kr/app.env | cut -d= -f2-; }
docker build --target runner -t kr-pos:latest \
 --build-arg NEXT_PUBLIC_SENTRY_DSN="$(g NEXT_PUBLIC_SENTRY_DSN)" \
 --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="$(g NEXT_PUBLIC_TURNSTILE_SITE_KEY)" \
 --build-arg NEXT_PUBLIC_SUPABASE_URL="$(g NEXT_PUBLIC_SUPABASE_URL)" \
 --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$(g NEXT_PUBLIC_SUPABASE_ANON_KEY)" . > /opt/kr/build2.log 2>&1 && echo BUILD_OK >> /opt/kr/build2.log
