export function responseContentType(response: {
  headers: Record<string, string | string[] | number | undefined>;
}) {
  const contentType = response.headers['content-type'];

  if (Array.isArray(contentType)) {
    return typeof contentType[0] === 'string'
      ? contentType[0].split(';')[0]
      : undefined;
  }

  return typeof contentType === 'string'
    ? contentType.split(';')[0]
    : undefined;
}
