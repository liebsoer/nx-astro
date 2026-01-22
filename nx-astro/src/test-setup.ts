jest.mock('@nx/devkit', () => {
  const actual = jest.requireActual('@nx/devkit');
  return {
    ...actual,
    formatFiles: jest.fn().mockResolvedValue(undefined),
  };
});
