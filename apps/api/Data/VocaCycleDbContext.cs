using Microsoft.EntityFrameworkCore;
using VocaCycle.Api.Models;
namespace VocaCycle.Api.Data;

public class VocaCycleDbContext : DbContext
{
    public VocaCycleDbContext(DbContextOptions<VocaCycleDbContext> options)
        : base(options)
    {
    }

    public DbSet<Word> Words { get; set; }
}