using Microsoft.EntityFrameworkCore;
using VocaCycle.Api.Data;
using VocaCycle.Api.Contracts;
using VocaCycle.Api.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddDbContext<VocaCycleDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
var app = builder.Build();

// Configure the HTTP request pipeline.

app.UseHttpsRedirection();


app.MapGet("/health", () => new { status = "ok" });
app.MapPost("/words", async (CreateWordRequest request, VocaCycleDbContext db) =>
{
    var word = new Word
    {
        Text = request.Text,
        Translation = request.Translation
    };

    db.Words.Add(word);
    await db.SaveChangesAsync();

    return Results.Created($"/words/{word.Id}", word);
});
app.MapGet("/words", async (VocaCycleDbContext db) =>
{
    var words = await db.Words.ToListAsync();

    return Results.Ok(words);
});

app.Run();

